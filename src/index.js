const AirTable = require("airtable");
const config = require("../config.json");
const csv = require("csvtojson");
const XLSX = require("xlsx");

String.prototype.toProperCase = function () {
    return this.replace(/\w\S*/g, function (txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
};

const base = new AirTable({ apiKey: config["api-key"] }).base(
    config["base-id"]
);

const datePattern = /(\d{1,2})\/(\d{1,2})\/(\d{2}) (\d{1,2})\:(\d{1,2})(am|pm)/;
const levelPattern = /(\d\d)/

async function getGameData(
    gameId,
    date,
    homeTeamName,
    awayTeamName,
    locationName,
    field,
    level,
    center,
    ar1,
    ar2,
    fourth
) {
    const data = {
        fields: {
            "Game id": gameId,
            Date: date.toISOString(),
            "Home Team": [await getOrCreateFromTable(homeTeamName, "Teams")],
            "Away Team": [await getOrCreateFromTable(awayTeamName, "Teams")],
            Location: [await getOrCreateFromTable(locationName, "Locations")],
            Field: field,
            Level: level,
            "Added by CLI": true,
            "Center Referee": (center ? [await getOrCreateReferee(center)] : []),
            "Assistant Referee 1": (ar1 ? [await getOrCreateReferee(ar1)] : []),
            "Assistant Referee 2": (ar2 ? [await getOrCreateReferee(ar2)] : []),
            "4th Official": (fourth ? [await getOrCreateReferee(fourth)] : []),
        },
    };

    return data;
}

async function getAirtableGameID(gameId) {
    let response = await base("Games")
        .select({
            filterByFormula: "{Game id} = '" + gameId + "'",
        })
        .all();

    if (response.length > 0) {
        return response[0].id;
    }
    return null;
}

async function getOrCreateFromTable(name, tableName) {
    let response = await base(tableName)
        .select({
            filterByFormula: 'UPPER({Name}) = UPPER("' + name + '")',
        })
        .all();

    if (response.length >= 1) {
        return response[0].getId();
    }

    return (
        await base(tableName).create([
            {
                fields: {
                    Name: name,
                },
            },
        ])
    )[0].getId();
}

async function getOrCreateReferee(name) {
    if (name == config["referee-name"]) {
        return config["referee-table-you-id"];
    }

    return getOrCreateFromTable(name, "Referees");
}

async function processCSV(csvPath) {
    try {
        let data = await csv().fromFile(csvPath);
        let toAdd = [];
        let toUpdate = [];
        for (const index in data) {
            game = data[index];
            if (!game["Game #"]) {
                continue;
            }

            let locationFieldArray = game["Location"].split(" - ");
            let location = locationFieldArray.shift().toProperCase();
            let field = locationFieldArray.join(" - ");
            let level = "U" + game["Level"].match(levelPattern)[0]
            let center = getOfficialName(game["Official 1"]);
            let ar1 = getOfficialName(game["Official 2"]);
            let ar2 = getOfficialName(game["Official 3"]);
            let fourthOffical = getOfficialName(game["Official 4"]);

            let date = new Date(
                game["Date Time"].replace(datePattern, "20$3-$1-$2 $4:$5 $6") +
                    " GMT-0600"
            );

            let gameData = await getGameData(
                game["Game #"],
                date,
                game["Home"],
                game["Away"],
                location,
                field,
                level,
                center,
                ar1,
                ar2,
                fourthOffical
            );

            let idIfExists = await getAirtableGameID(game["Game #"]);
            if (idIfExists) {
                console.log("UPDATE: " + game["Game #"]);
                gameData["id"] = idIfExists;
                toUpdate.push(gameData);
            } else {
                console.log("CREATE: " + game["Game #"]);
                toAdd.push(gameData);
            }
        }

        console.log("Create: " + toAdd.length);
        console.log("Update: " + toUpdate.length);

        if (toAdd.length > 0) {
            let toAddArrays = [];
            while (toAdd.length > 10) {
                toAddArrays.push(toAdd.splice(0, 10));
            }
            toAddArrays.push(toAdd);
            for (const index in toAddArrays) {
                console.log("Pushing create array " + index);
                await base("Games").create(toAddArrays[index]);
            }
        }

        if (toUpdate.length > 0) {
            let toUpdateArrays = [];
            while (toUpdate.length > 10) {
                toUpdateArrays.push(toUpdate.splice(0, 10));
            }
            toUpdateArrays.push(toUpdate);
            for (const index in toUpdateArrays) {
                console.log("Pushing update array" + index);
                await base("Games").update(toUpdateArrays[index]);
            }
        }
        console.log("Done");
    } catch (e) {
        console.log(e);
    }
}
function getOfficialName(officialNameData) {
    if ((officialNameData == "" || officialNameData.includes("[  TBD  ]") || officialNameData.includes("[ UNKNOWN - N/A ]"))) {
        return null;
    }
    return officialNameData.slice(4).toProperCase().trim();
}

function convertXLSToCSV() {
    const workbook = XLSX.readFile(".\\OfficialsSchedule.xls");
    XLSX.writeFile(workbook, "OfficialsSchedule.csv", { bookType: "csv" });
}

convertXLSToCSV();
processCSV(".\\OfficialsSchedule.csv");

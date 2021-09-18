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

async function getGameData(
    gameId,
    position,
    date,
    homeTeamName,
    awayTeamName,
    locationName,
    field,
    level
) {
    const data = {
        fields: {
            "Game id": gameId,
            Position: position,
            Date: date.toISOString(),
            "Home Team": [await getOrCreateTeam(homeTeamName)],
            "Away Team": [await getOrCreateTeam(awayTeamName)],
            Location: [await getOrCreateLocation(locationName)],
            Field: field,
            Level: level,
            "Added by CLI": true,
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

async function getOrCreateTeam(teamName) {
    let response = await base("Teams")
        .select({
            filterByFormula: 'UPPER({Name}) = UPPER("' + teamName + '")',
        })
        .all();

    if (response.length >= 1) {
        return response[0].getId();
    }

    return (
        await base("Teams").create([
            {
                fields: {
                    Name: teamName,
                },
            },
        ])
    )[0].getId();
}

async function getOrCreateLocation(locationName) {
    let response = await base("Locations")
        .select({
            filterByFormula: 'UPPER({Name}) = UPPER("' + locationName + '")',
        })
        .all();

    if (response.length >= 1) {
        return response[0].getId();
    }

    return (
        await base("Locations").create([
            {
                fields: {
                    Name: locationName,
                },
            },
        ])
    )[0].getId();
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
            let level = game["Level"].split(" ")[0];
            let position = "4th Offical";
            if (isThisOffical(game["Official 1"])) {
                position = "Center";
            } else if (isThisOffical(game["Official 2"])) {
                position = "AR1";
            } else if (isThisOffical(game["Official 3"])) {
                position = "AR2";
            }
            let date = new Date(
                game["Date Time"].replace(datePattern, "20$3-$1-$2 $4:$5 $6") +
                    " GMT-0600"
            );

            let gameData = await getGameData(
                game["Game #"],
                position,
                date,
                game["Home"],
                game["Away"],
                location,
                field,
                level
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
function isThisOffical(officalData) {
    return officalData
        .toLowerCase()
        .includes(config["referee-name"].toLowerCase());
}

function convertXLSToCSV() {
    const workbook = XLSX.readFile(".\\OfficialsSchedule.xls");
    XLSX.writeFile(workbook, "OfficialsSchedule.csv", { bookType: "csv" });
}

convertXLSToCSV();
processCSV(".\\OfficialsSchedule.csv");

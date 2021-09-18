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
    field
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
    console.log(teamName)
    let response = await base("Teams")
        .select({
            filterByFormula: "{Name} = \"" + teamName + "\"",
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
    console.log(locationName)
    let response = await base("Locations")
        .select({
            filterByFormula: "{Name} = \"" + locationName + "\"",
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
            field
        );

        let idIfExists = await getAirtableGameID(game["Game #"]);
        if (idIfExists) {
            gameData["id"] = idIfExists;
            toUpdate.push(gameData);
        } else {
            toAdd.push(gameData);
        }
        console.log("Got data for " + game["Game #"]);
    }

    if (toAdd.length > 0) {
        await base("Games").create(toAdd);
    }

    if (toUpdate.length > 0) {
        await base("Games").update(toUpdate);
    }
    console.log("Done");
} catch (e) {
    console.log(e)
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

const AirTable = require("airtable");
const config = require("../config.json");
const csv=require('csvtojson')

String.prototype.toProperCase = function () {
    return this.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
};

const base = new AirTable({ apiKey: config["api-key"] }).base(
    config["base-id"]
);

const datePattern = /(\d{1,2})\/(\d{1,2})\/(\d{2}) (\d{1,2})\:(\d{1,2})(am|pm)/;

async function createGame(
    gameId,
    position,
    date,
    homeTeamName,
    awayTeamName,
    locationName,
    field
) {
    try {
    await base("Games").create([
        {
            fields: {
                "Game id": gameId,
                Position: position,
                Date: date.toISOString(),
                "Home Team": [await getOrCreateTeam(homeTeamName)],
                "Away Team": [await getOrCreateTeam(awayTeamName)],
                Location: [await getOrCreateLocation(locationName)],
                Field: field,
            },
        },
    ]);
} catch (err) {
    console.log(err)
}
}

async function getOrCreateTeam(teamName) {
    let response = await base("Teams")
        .select({
            filterByFormula: "{NAME} = '" + teamName + "'",
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
            filterByFormula: "{NAME} = '" + locationName + "'",
        })
        .all();

    if (response.length >= 1) {
        return response[0].getId();
    }

    return (
        await base("locationName").create([
            {
                fields: {
                    Name: locationName,
                },
            },
        ])
    )[0].getId();
}

async function processCSV(csvPath) {
    let data = await csv().fromFile(csvPath);
    for (const index in data) {
        game = data[index];
        if (!game["Game #"]) {
            continue;
        }

        let location = game["Location"].split(" - ")[0].toProperCase();
        let field = game["Location"].split(" - ").shift().join(" - ");
        let position = "4th Offical"
        if (isThisOffical(game["Official 1"])) {
            position = "Center"
        } else if (isThisOffical(game["Official 2"])) {
            position = "AR1"
        } else if (isThisOffical(game["Official 3"])) {
            position = "AR2"
        }
        let date = new Date(game["Date Time"].replace(datePattern, '20$3-$1-$2 $4:$5 $6') + " GMT-0600")

        await createGame(game["Game #"], position, date, game["Home"], game["Away"], location, field);
        console.log("Processed " + game["Game #"])
    }
    console.log("Done")
}

function isThisOffical(officalData) {
    return officalData.toLowerCase().includes(config["referee-name"].toLowerCase())
}

processCSV(".\\schedule.csv")

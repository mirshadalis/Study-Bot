const Discord = require("discord.js");
const client = new Discord.Client();
const PREFIX = "-";
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();
const token = process.env.TOKEN;

const fs = require("fs"); // For checking if database file exists

const dbPath = "./databases.sqlite";
const botCommandsId = "1252940156927742065";

// Check if the database file exists
const dbExists = fs.existsSync(dbPath);

// Create or connect to the database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error connecting to database:", err);
  } else {
    console.log("Connected to database successfully!");

    if (!dbExists) {
      db.run(
        `
           CREATE TABLE IF NOT EXISTS studyTimes (
             userId TEXT PRIMARY KEY,
             startTime TEXT,
             total REAL DEFAULT 0.0
           )
         `,
        (err) => {
          if (err) {
            console.error("Error creating table:", err);
          } else {
            console.log("Table created successfully!");
          }
        }
      );
    }
  }
});

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

function millisecondsToHours(milliseconds) {
  return milliseconds / (1000 * 60 * 60);
}

client.on("voiceStateUpdate", (oldState, newState) => {
  let userId = newState.id;

  const isJoining =
    !oldState.channel &&
    newState.channel &&
    !newState.channel.parent?.name.toLowerCase().includes("others") &&
    !newState.channel.name.toLowerCase().startsWith("chill-");
  const isLeaving = oldState.channel && !newState.channel;

  if (isJoining || isLeaving) {
    // Wrap the database logic in a Promise
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM studyTimes WHERE userId = ?`,
        [userId],
        (err, userData) => {
          if (err) {
            console.error("Error fetching data from the database:", err);
            reject(err); // Reject the Promise if there's an error
            return;
          }

          if (isJoining) {
            // User joined a voice channel
            if (!userData) {
              // New user
              db.run(
                `INSERT INTO studyTimes(userId, startTime, total) VALUES (?, ?, ?)`,
                [userId, new Date().toISOString(), 0.0],
                (err) => {
                  if (err) {
                    console.error("Error inserting data:", err);
                    reject(err); // Reject on error
                  } else {
                    resolve(); // Resolve the Promise if successful
                  }
                }
              );
            } else if (!userData.startTime) {
              // Resuming session
              db.run(
                `UPDATE studyTimes SET startTime = ? WHERE userId = ?`,
                [new Date().toISOString(), userId],
                (err) => {
                  if (err) {
                    console.error("Error updating data:", err);
                    reject(err); // Reject on error
                  } else {
                    resolve(); // Resolve the Promise if successful
                  }
                }
              );
            }
          } else if (isLeaving) {
            // User left a voice channel
            if (userData && userData.startTime) {
              let startTime = new Date(userData.startTime);
              let elapsedMilliseconds = new Date() - startTime;
              let elapsedHours = millisecondsToHours(elapsedMilliseconds);

              let newTotal = parseFloat(userData.total) + elapsedHours;

              db.run(
                `UPDATE studyTimes SET startTime = NULL, total = ? WHERE userId = ?`,
                [newTotal, userId],
                (err) => {
                  if (err) {
                    console.error("Error updating data:", err);
                    reject(err); // Reject on error
                  } else {
                    resolve(); // Resolve the Promise if successful
                  }
                }
              );
            }
          }
        }
      );
    });
  }
});

client.on("message", async (message) => {
  if (!message.content.startsWith(PREFIX) || message.author.bot) return;
  
  if (message.channel.id !== botCommandsId) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === "stats") {
    let userId = message.author.id;

    try {
      // Trigger a voiceStateUpdate if the user is currently in a voice channel
      // This ensures the database is up-to-date before fetching stats.
      await client.emit('voiceStateUpdate', {}, { id: userId }); 

      // Wait for the Promise from voiceStateUpdate to resolve before fetching data
      const row = await new Promise((resolve, reject) => {
        db.get(
          `SELECT total FROM studyTimes WHERE userId = ?`,
          [userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (row) {
        let totalHours = row.total.toFixed(2);
        message.channel.send(
          `${message.author}, your total study time is: ${totalHours} hours`
        );
      } else {
        message.channel.send(
          `${message.author}, you have no study time recorded!`
        );
      }
    } catch (error) {
      console.error("Error fetching study data:", error);
      message.channel.send("An error occurred while fetching your stats.");
    }
  }else if (command === "lb") {
    db.all(
      `SELECT * FROM studyTimes ORDER BY total DESC LIMIT 10`,
      (err, rows) => {
        if (err) {
          console.error("Error fetching data:", err);
          message.channel.send(
            "An error occurred while fetching the leaderboard."
          );
          return;
        }

        if (rows.length === 0){
          message.channel.send("No study hours records found or no users are available!");
          return;
        }

        const leaderboardEmbed = new Discord.MessageEmbed()
          .setColor('#0099ff')
          .setTitle('Study Leaderboard')
          .setDescription('Top 10 Users by Study Time')
          .setTimestamp();
        
        let count = 1;
        rows.forEach((row) => {
          let member = message.guild.members.cache.get(row.userId);
          if (member){
            let userHours = row.total.toFixed(2);
            leaderboardEmbed.addField(`${count}. ${member.user.username}#${member.user.discriminator}`, `${userHours} hours`);
            count++;
          }
        });

        message.channel.send({ embeds: [leaderboardEmbed] });
      }
    );
  } else if (command === "p") {

    const studyRoles = [
      {
        name: "Novice Scholar",
        time: millisecondsToHours(10 * 60 * 1000), // 10 minutes in hours
        roleId: "1254721791226810450",
      },
      {
        name: "Apprentice Scholar",
        time: millisecondsToHours(1 * 60 * 60 * 1000), // 1 hour in hours
        roleId: "1254722449300389990",
      },
      {
        name: "Junior Scholar",
        time: millisecondsToHours(3 * 60 * 60 * 1000), // 3 hours in hours
        roleId: "1254722592837861426",
      },
      {
        name: "Adept Scholar",
        time: millisecondsToHours(5 * 60 * 60 * 1000), // 5 hours in hours
        roleId: "1254722732470439967",
      },
      {
        name: "Skilled Scholar",
        time: millisecondsToHours(10 * 60 * 60 * 1000), // 10 hours in hours
        roleId: "1254722933008629780",
      },
      {
        name: "Seasoned Scholar",
        time: millisecondsToHours(15 * 60 * 60 * 1000), // 15 hours in hours
        roleId: "1254723284969197588",
      },
      {
        name: "Advanced Scholar",
        time: millisecondsToHours(20 * 60 * 60 * 1000), // 20 hours in hours
        roleId: "1254723489387249684",
      },
      {
        name: "Expert Scholar",
        time: millisecondsToHours(30 * 60 * 60 * 1000), // 30 hours in hours
        roleId: "1254723566729953342",
      },
      {
        name: "Master Scholar",
        time: millisecondsToHours(40 * 60 * 60 * 1000), // 40 hours in hours
        roleId: "1254723709458059339",
      },
      {
        name: "Senior Scholar",
        time: millisecondsToHours(50 * 60 * 60 * 1000), // 50 hours in hours
        roleId: "1254723826034409482",
      },
      {
        name: "Elite Scholar",
        time: millisecondsToHours(65 * 60 * 60 * 1000), // 65 hours in hours
        roleId: "1254724434758209536",
      },
      {
        name: "Prodigious Scholar",
        time: millisecondsToHours(80 * 60 * 60 * 1000), // 80 hours in hours
        roleId: "1254724538659241997",
      },
      {
        name: "Renowned Scholar",
        time: millisecondsToHours(100 * 60 * 60 * 1000), // 100 hours in hours
        roleId: "1254724607014076497",
      },
      {
        name: "Legendary Scholar",
        time: millisecondsToHours(125 * 60 * 60 * 1000), // 125 hours in hours
        roleId: "1254724710885757009",
      },
      {
        name: "Eminent Scholar",
        time: millisecondsToHours(150 * 60 * 60 * 1000), // 150 hours in hours
        roleId: "1254724765659172864",
      },
    ];

    try {
      // Get the user ID of the person who used the command
      const userIdToUpdate = message.author.id;

      const userData = await new Promise((resolve, reject) => {
        db.get(
          `SELECT total FROM studyTimes WHERE userId = ?`,
          [userIdToUpdate],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!userData) {
        return message.channel.send("You have no study time recorded!");
      }

      const guild = message.guild;
      const memberToUpdate = guild.members.cache.get(userIdToUpdate);

      if (memberToUpdate) {
        const userHours = millisecondsToHours(userData.total);

        // Find the appropriate role based on study time
        let roleToAssign = studyRoles[0]; // Default to the lowest role
        for (const roleData of studyRoles) {
          if (userHours >= roleData.time) {
            roleToAssign = roleData;
          } else {
            break;
          }
        }

        // Try to find the role object by ID
        let role = guild.roles.cache.get(roleToAssign.roleId);

        // Assign the role if found and not already assigned
        if (role) {
          // Remove other study roles before assigning the correct one
          const rolesToRemove = studyRoles
            .filter((r) => r.name !== roleToAssign.name) // Exclude the role to assign
            .map((r) => guild.roles.cache.find((gR) => gR.name === r.name))
            .filter((r) => r !== undefined);

          await memberToUpdate.roles.remove(rolesToRemove).catch(console.error);

          if (!memberToUpdate.roles.cache.has(role.id)) {
            await memberToUpdate.roles.add(role);
            message.channel.send(
              `Role ${role.name} added successfully to <@${userIdToUpdate}>`
            );
          } else {
            message.channel.send(`You already have the role ${role.name}!`);
          }
        }
      } else {
        console.error("Member not found in the server.");
      }
    } catch (error) {
      console.error("Error updating study roles:", error);
      message.channel.send("An error occurred while updating study roles.");
    }
  }
});

client.login(token);
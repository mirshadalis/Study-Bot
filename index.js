const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();
const fs = require('fs');
const token = process.env.TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const PREFIX = "-";
const dbPath = "./databases.sqlite";
const botCommandsId = "1252940156927742065"; 
const generalChannel = "1229479282372251791";

const dbExists = fs.existsSync(dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error connecting to database:", err);
  } else {
    console.log("Connected to database successfully!");

    // Use db.run with a callback for table creation inside db connection check:
    db.run(
      `
       CREATE TABLE IF NOT EXISTS studyTimes (
         userId TEXT PRIMARY KEY,
         startTime TEXT,
         total REAL DEFAULT 0.0,
         daily REAL DEFAULT 0.0,
         monthly REAL DEFAULT 0.0,
         allTime REAL DEFAULT 0.0,
         streak INTEGER DEFAULT 0,
         lastStudiedDate TEXT,
         longestStreak INTEGER DEFAULT 0
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
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("voiceStateUpdate", (oldState, newState) => {
  let userId = newState.id;
  const isJoining =
    !oldState.channel &&
    newState.channel &&
    (newState.channel.parent?.name.toLowerCase().includes("voice channels") ||
      newState.channel.parent?.name.toLowerCase().includes("custom rooms"));
  const isLeaving = oldState.channel && !newState.channel;

  if (isJoining || isLeaving) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM studyTimes WHERE userId = ?`,
        [userId],
        (err, userData) => {
          if (err) {
            console.error("Error fetching data from the database:", err);
            reject(err);
            return;
          }

          let now = new Date();
          let todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          let thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

          if (isJoining) {
            if (!userData) {
              db.run(
                `INSERT INTO studyTimes(userId, startTime, total, daily, monthly, allTime, streak, lastStudiedDate) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, now.toISOString(), 0.0, 0.0, 0.0, 0.0, 0, null],
                (err) => {
                  if (err) {
                    console.error("Error inserting data:", err);
                    reject(err);
                  } else {
                    resolve();
                  }
                }
              );
            } else if (!userData.startTime) {
              db.run(
                `UPDATE studyTimes SET startTime = ? WHERE userId = ?`,
                [now.toISOString(), userId],
                (err) => {
                  if (err) {
                    console.error("Error updating data:", err);
                    reject(err);
                  } else {
                    resolve();
                  }
                }
              );
            }
          } else if (isLeaving && userData && userData.startTime) {
            let startTime = new Date(userData.startTime);
            let endTime = now;
            let elapsedHours = (endTime - startTime) / (1000 * 60 * 60);
            let dailyHours = (endTime > todayStart)
              ? (endTime - (startTime > todayStart ? startTime : todayStart)) / (1000 * 60 * 60)
              : 0.0;
            let monthlyHours = (endTime > thisMonthStart)
              ? (endTime - (startTime > thisMonthStart ? startTime : thisMonthStart)) / (1000 * 60 * 60)
              : 0.0;

            // streak calculation - irshad
            let lastStudiedDate = userData.lastStudiedDate ? new Date(userData.lastStudiedDate) : null;
            let yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);

            let newStreak = userData.streak || 0;
            if (
              !lastStudiedDate ||
              (lastStudiedDate.getFullYear() === yesterday.getFullYear() &&
                lastStudiedDate.getMonth() === yesterday.getMonth() &&
                lastStudiedDate.getDate() === yesterday.getDate())
            ) {
              newStreak++; 
            } else {
              newStreak = 1; 
            }

            // Update Database
            let newTotal = parseFloat(userData.total) + elapsedHours;
            let newDaily = parseFloat(userData.daily) + dailyHours;
            let newMonthly = parseFloat(userData.monthly) + monthlyHours;
            let newAllTime = parseFloat(userData.allTime) + elapsedHours;
            let newLongestStreak = userData.longestStreak || 0;
            if (newStreak > newLongestStreak) {
              newLongestStreak = newStreak;
            }
            db.run(
              `UPDATE studyTimes 
               SET startTime = NULL, 
                   total = ?, 
                   daily = ?, 
                   monthly = ?, 
                   allTime = ?,
                   streak = ?, 
                   lastStudiedDate = ?,
                   longestStreak = ?
               WHERE userId = ?`,
               [newTotal, newDaily, newMonthly, newAllTime, newStreak, now.toISOString(), newLongestStreak, userId],
              (err) => {
                if (err) {
                  console.error("Error updating data:", err);
                  reject(err);
                } else {
                  resolve();
                }
              }
            );
          } 
        }
      );
    }).catch(console.error);
  }
});

client.on("messageCreate", async (message) => {
  if (!message.content.startsWith(PREFIX) || message.author.bot) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === "stats") {
    if (message.channel.id !== botCommandsId && message.channel.parentId != 1252874447359049850) return;
    let userId = message.author.id;

    try {
      await client.emit('voiceStateUpdate', {}, { id: userId });

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
  } else if (command === "lb") {
    if (message.channel.id !== botCommandsId && message.channel.parentId != 1252874447359049850) return;
    let page = 0;
    const itemsPerPage = 10;

    db.all(`SELECT * FROM studyTimes ORDER BY total DESC`, async (err, rows) => {
      if (err) {
        console.error("Error fetching data:", err);
        message.channel.send(
          "An error occurred while fetching the leaderboard."
        );
        return;
      }

      console.log("rows:", rows);

      const guild = message.guild;
      await guild.members.fetch();

      const fields = rows.slice(0, itemsPerPage).map((row, index) => {
        const member = guild.members.cache.get(row.userId);
        if (member) {
          return {
            name: `${(page * itemsPerPage) + index + 1}. ${member.user.username}#${member.user.discriminator}`,
            value: `${row.total.toFixed(2)} hours`
          };
        } else {
          return {
            name: `${(page * itemsPerPage) + index + 1}. User ID: ${row.userId}`,
            value: `${row.total.toFixed(2)} hours`
          };
        }
      });

      if (fields.length === 0) {
        message.channel.send("No study records found.");
        return;
      }

      // console.log("fields:", fields); <-- Uncomment to debug fields from console - beyond 

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Study Leaderboard')
        .setDescription(`Page ${page + 1}`)
        .setTimestamp();

      for (const field of fields) {
        embed.addFields({ name: field.name, value: field.value });
      }

      try {
        const embedMessage = await message.channel.send({ embeds: [embed] });

        if (rows.length > itemsPerPage) {
          await embedMessage.react('⬅️');
          await embedMessage.react('➡️');

          const filter = (reaction, user) => {
            return ['⬅️', '➡️'].includes(reaction.emoji.name) && !user.bot;
          };

          const collector = embedMessage.createReactionCollector({ filter, time: 60000 });

          collector.on('collect', (reaction) => {
            if (reaction.emoji.name === '➡️') {
              if ((page + 1) * itemsPerPage < rows.length) {
                page++;
                embedMessage.edit({ embeds: [embed] });
              }
            } else if (reaction.emoji.name === '⬅️') {
              if (page > 0) {
                page--;
                embedMessage.edit({ embeds: [embed] });
              }
            }
          });

          collector.on('end', () => {
            embedMessage.reactions.removeAll().catch(console.error);
          });
        }
      } catch (error) {
        console.error("Error sending leaderboard message:", error);
        message.channel.send("An error occurred while sending the leaderboard.");
      }
    });
  } else if (command === "eng" || command === "english") {
    await message.delete();
    if (message.channel.id !== generalChannel && message.channel.parentId != 1252874447359049850) return;
    const targetMessage = message.reference ? await message.channel.messages.fetch(message.reference.messageId) : null;
    const embed = new EmbedBuilder()
        .setTitle('📢  English Only Reminder\n')
        .setDescription("`Rule 7:` English in <#1229479282372251791> Channel\nTo maintain clear communication, **English** is required in the <#1229479282372251791> channel. This rule helps ensure that everyone can understand and engage in discussions effectively.\n\nPlease refer to the <#1252867798590558240> for more details on our guidelines. Conversations in other languages should occur in designated language channels (e.g., <#1252868140916801641> and other).\n\n**Failure to comply** with this policy will result in moderation actions, including possible time-outs.\n\nThank you for your understanding.");
    if (targetMessage) {
      if(targetMessage.author.bot) return;
        const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
        await targetMessage.reply({ embeds: [embed] });
    }
    else {
      const embedMessage = await message.channel.send({ embeds: [embed] });
    }
  } else if (command === "p") {
    if (message.channel.id !== botCommandsId && message.channel.parentId != 1252874447359049850) return;
    const studyRoles = [
      {
        name: "Novice Scholar",
        time: 1, 
        roleId: "1254721791226810450",
      },
      {
        name: "Apprentice Scholar",
        time: millisecondsToHours(1 * 60 * 60 * 1000), 
        roleId: "1254722449300389990",
      },
      {
        name: "Junior Scholar",
        time: millisecondsToHours(3 * 60 * 60 * 1000), 
        roleId: "1254722592837861426", 
      },
      {
        name: "Adept Scholar",
        time: millisecondsToHours(5 * 60 * 60 * 1000), 
        roleId: "1254722732470439967",
      },
      {
        name: "Skilled Scholar",
        time: millisecondsToHours(10 * 60 * 60 * 1000),
        roleId: "1254722933008629780",
      },
      {
        name: "Seasoned Scholar",
        time: millisecondsToHours(15 * 60 * 60 * 1000), 
        roleId: "1254723284969197588",
      },
      {
        name: "Advanced Scholar",
        time: millisecondsToHours(15 * 60 * 60 * 1000), 
        roleId: "1254723284969197588",
      },
      {
        name: "Expert Scholar",
        time: millisecondsToHours(20 * 60 * 60 * 1000),
        roleId: "1254723566729953342",
      },
      {
        name: "Master Scholar",
        time: millisecondsToHours(30 * 60 * 60 * 1000), 
        roleId: "1254723709458059339",
      },
      
      {
        name: "Senior Scholar",
        time: millisecondsToHours(25 * 60 * 60 * 1000), 
        roleId: "1254723826034409482",
      },
      {
        name: "Elite Scholar",
        time: millisecondsToHours(40 * 60 * 60 * 1000), 
        roleId: "1254723724854390865",
      },
      {
        name: "Prodigious Scholar",
        time: millisecondsToHours(50 * 60 * 60 * 1000), 
        roleId: "1254723824964859965",
      },
      {
        name: "Renowned Scholar",
        time: millisecondsToHours(50 * 60 * 60 * 1000), 
        roleId: "1254723824964859965",
      },
      {
        name: "Legendary Scholar",
        time: millisecondsToHours(50 * 60 * 60 * 1000), 
        roleId: "1254723824964859965",
      },
      {
        name: "Eminent Scholar",
        time: millisecondsToHours(50 * 60 * 60 * 1000), 
        roleId: "1254723824964859965",
      }
    ];

    const userId = message.author.id;
    const member = message.guild.members.cache.get(userId);

    if (!member) {
      message.channel.send("Member not found.");
      return;
    }

    db.get(
      `SELECT total FROM studyTimes WHERE userId = ?`,
      [userId],
      (err, row) => {
        if (err) {
          console.error("Error fetching data:", err);
          message.channel.send(
            "An error occurred while fetching your study time."
          );
          return;
        }

        if (!row) {
          message.channel.send(
            "You have not recorded any study time yet."
          );
          return;
        }

        const totalStudyTime = parseFloat(row.total);

        const newRoles = [];
        const oldRoles = [];

        studyRoles.forEach((role) => {
          const guildRole = message.guild.roles.cache.get(role.roleId);

          if (guildRole) {
            if (totalStudyTime >= role.time) {
              if (!member.roles.cache.has(role.roleId)) {
                member.roles.add(role.roleId);
                newRoles.push(guildRole.name);
              }
            } else {
              if (member.roles.cache.has(role.roleId)) {
                member.roles.remove(role.roleId);
                oldRoles.push(guildRole.name);
              }
            }
          } else {
            console.error(`Role ${role.name} not found in the server.`);
          }
        });

        let responseMessage = "Roles updated:\n";

        if (newRoles.length > 0) {
          responseMessage += `Added: ${newRoles.join(", ")}\n`;
        }

        if (oldRoles.length > 0) {
          responseMessage += `Removed: ${oldRoles.join(", ")}`;
        }

        if (newRoles.length === 0 && oldRoles.length === 0) {
          responseMessage += "No role changes.";
        }

        message.channel.send(responseMessage);
      }
    );
  }
});

client.login(token);

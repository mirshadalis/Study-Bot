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

    db.run(
      `
       CREATE TABLE IF NOT EXISTS studyTimes (
         userId TEXT PRIMARY KEY,
         startTime TEXT,
         total REAL DEFAULT 0.0,
         daily REAL DEFAULT 0.0,
         weekly REAL DEFAULT 0.0,
         monthly REAL DEFAULT 0.0,
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
          let thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
          let thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

          if (isJoining) {
            if (!userData) {
              db.run(
                `INSERT INTO studyTimes(userId, startTime, total, daily, weekly, monthly, streak, lastStudiedDate, longestStreak) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, now.toISOString(), 0.0, 0.0, 0.0, 0.0, 0, null, 0],
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
            let weeklyHours = (endTime > thisWeekStart)
              ? (endTime - (startTime > thisWeekStart ? startTime : thisWeekStart)) / (1000 * 60 * 60)
              : 0.0;
            let monthlyHours = (endTime > thisMonthStart)
              ? (endTime - (startTime > thisMonthStart ? startTime : thisMonthStart)) / (1000 * 60 * 60)
              : 0.0;

            // streak -irshad
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

            let newTotal = parseFloat(userData.total) + elapsedHours;
            let newDaily = parseFloat(userData.daily) + dailyHours;
            let newWeekly = parseFloat(userData.weekly || 0) + weeklyHours; 
            let newMonthly = parseFloat(userData.monthly) + monthlyHours;
            let newLongestStreak = Math.max(userData.longestStreak || 0, newStreak);

            db.run(
              `UPDATE studyTimes 
               SET startTime = NULL, 
                   total = ?, 
                   daily = ?, 
                   weekly = ?, 
                   monthly = ?, 
                   streak = ?, 
                   lastStudiedDate = ?,
                   longestStreak = ?
               WHERE userId = ?`,
              [newTotal, newDaily, newWeekly, newMonthly, newStreak, now.toISOString(), newLongestStreak, userId], 
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

function padString(input, width) {
  return input.padEnd(width);
}

client.on("messageCreate", async (message) => {
  if (!message.content.startsWith(PREFIX) || message.author.bot) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'stats') {
    if (message.channel.id !== botCommandsId && message.channel.parentId !== "1252874447359049850") return; 
    let userId = message.author.id;

    try {
      const row = await new Promise((resolve, reject) => {
        db.get(
          `SELECT * FROM studyTimes WHERE userId = ?`,
          [userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (row) {
        const [allTimeRank, monthlyRank, dailyRank, weeklyRank] = await Promise.all([
          calculateRank('total', row.total),
          calculateRank('monthly', row.monthly),
          calculateRank('daily', row.daily),
          calculateRank('weekly', row.weekly),
        ]);

        let totalHours = row.total.toFixed(2);
        let daily  = row.daily.toFixed(2);
        let monthly = row.monthly.toFixed(2);
        let weekly = row.weekly.toFixed(2);
        const columnWidths = [15, 10, 5];
        let header = `${padString("Timeframe", columnWidths[0])}${padString("Hours", columnWidths[1])}${padString("Place", columnWidths[2])}`;
        let dailyRow = `${padString("Daily:", columnWidths[0])}${padString(`${daily}h`, columnWidths[1])}${padString(`#${dailyRank}`, columnWidths[2])}`;
        let weeklyRow = `${padString("Weekly:", columnWidths[0])}${padString(`${weekly}h`, columnWidths[1])}${padString(`#${weeklyRank}`, columnWidths[2])}`;
        let monthlyRow = `${padString("Monthly:", columnWidths[0])}${padString(`${monthly}h`, columnWidths[1])}${padString(`#${monthlyRank}`, columnWidths[2])}`;
        let allTimeRow = `${padString("All-time:", columnWidths[0])}${padString(`${totalHours}h`, columnWidths[1])}${padString(`#${allTimeRank}`, columnWidths[2])}`;
        let currentStreak = `Current study streak: ${row.streak} day${row.streak > 1 ? 's' : ''}`;
        let longestStreak = `Longest study streak: ${row.longestStreak} day${row.longestStreak > 1 ? 's' : ''}`;
        const embedContent = "\`\`\`css\n" +  header + '\n\n' + dailyRow + '\n' + weeklyRow + '\n' + monthlyRow + '\n' + allTimeRow +'\n\n' + currentStreak + '\n' + longestStreak + "\`\`\`";
        const statsEmbed = new EmbedBuilder()
        .setColor("5095FF")
        .setDescription("```Study Performance Summary```\n" + embedContent)
        .setFooter({ text: message.author.username, iconURL: message.author.displayAvatarURL()});
        
        const statsEmbedMessage = await message.channel.send({ embeds: [statsEmbed] });
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
    try {
      const studyRoles = [
        {
          name: "Novice Scholar",
          time: 0.6, 
          roleId: "1254721791226810450",
        },
        {
          name: "Apprentice Scholar",
          time: 1, 
          roleId: "1254722449300389990",
        },
        {
          name: "Junior Scholar",
          time: 3,
          roleId: "1254722592837861426",
        },
        {
          name: "Adept Scholar",
          time: 5, 
          roleId: "1254722732470439967",
        },
        {
          name: "Skilled Scholar",
          time: 10,
          roleId: "1254722933008629780",
        },
        {
          name: "Seasoned Scholar",
          time: 15, 
          roleId: "1254723284969197588",
        },
        {
          name: "Advanced Scholar",
          time: 20, 
          roleId: "1254723489387249684",
        },
        {
          name: "Expert Scholar",
          time: 30,
          roleId: "1254723566729953342",
        },
        {
          name: "Master Scholar",
          time: 40, 
          roleId: "1254723709458059339",
        },
        
        {
          name: "Senior Scholar",
          time: 50,
          roleId: "1254723826034409482",
        },
        {
          name: "Elite Scholar",
          time: 65, 
          roleId: "1254724434758209536",
        },
        {
          name: "Prodigious Scholar",
          time: 80, 
          roleId: "1254724538659241997",
        },
        {
          name: "Renowned Scholar",
          time: 100, 
          roleId: "1254724607014076497",
        },
        {
          name: "Legendary Scholar",
          time: 125, 
          roleId: "1254724710885757009",
        },
        {
          name: "Eminent Scholar",
          time: 150, 
          roleId: "1254724765659172864",
        }
      ];

      const userId = message.author.id;
      const member = message.guild.members.cache.get(userId);

      if (!member) {
        message.channel.send("Member not found.");
        return;
      }

      const row = await new Promise((resolve, reject) => {
        db.get(
          `SELECT * FROM studyTimes WHERE userId = ?`,
          [userId],
          (err, row) => {
            if (err) reject(err); 
            else resolve(row);
          }
        );
      });

      if (!row) {
        return message.channel.send("You have not recorded any study time yet.");
      }

      const monthlyStudyTime = parseFloat(row.monthly);
      const responseMessage = await updateRoles(member, monthlyStudyTime, studyRoles);
      message.channel.send(responseMessage);
    } catch (error) {
      console.error("Error updating roles:", error);
      message.channel.send("An error occurred while updating your roles.");
    }
  }
});

async function updateRoles(member, totalStudyTime, studyRoles) {
  const newRoles = [];
  const removedRoles = []; 

  for (const roleData of studyRoles) {
    const guildRole = member.guild.roles.cache.get(roleData.roleId);

    if (!guildRole) {
      console.error(`Role ${roleData.name} not found in the server.`);
      continue; 
    }

    if (totalStudyTime >= roleData.time && !member.roles.cache.has(roleData.roleId)) {
      await member.roles.add(roleData.roleId).catch(console.error); 
      newRoles.push(guildRole.name);
    } else if (totalStudyTime < roleData.time && member.roles.cache.has(roleData.roleId)) {
      await member.roles.remove(roleData.roleId).catch(console.error);
      removedRoles.push(guildRole.name);
    }
  }

  let responseMessage = "Roles updated:\n";

  if (newRoles.length > 0) {
    responseMessage += `Added: ${newRoles.join(", ")}\n`;
  }

  if (removedRoles.length > 0) {
    responseMessage += `Removed: ${removedRoles.join(", ")}\n`;
  }

  if (newRoles.length === 0 && removedRoles.length === 0) {
    responseMessage = "No role changes."; 
  }

  return responseMessage;
}


async function calculateRank(statColumn, userStatValue) {
  try {
    const result = await new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(DISTINCT userId) AS rank 
         FROM studyTimes 
         WHERE ${statColumn} >= ?`, 
        [userStatValue],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row ? row.rank : 0); 
          }
        }
      );
    });

    return result;

  } catch (error) {
    console.error(`Error calculating rank for ${statColumn}:`, error);
    throw error;
  }
}

client.login(token);

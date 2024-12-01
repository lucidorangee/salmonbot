import axios from 'axios';
import { createCanvas, loadImage, registerFont } from 'canvas';
import { Client, GatewayIntentBits, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { writeFileSync, createWriteStream } from 'fs';
import { resolve as _resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { mkdirSync } from 'fs';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const SCHEDULE_URL = "https://splatoon3.ink/data/schedules.json";
const TRANSLATION_URL = "https://splatoon3.ink/data/locale/ko-KR.json";
const SCHEDULE_CHANNEL = process.env.SCHEDULE_CHANNEL;
const BACKGROUND_CANVAS = process.env.BACKGROUND_CANVAS;

let translationData = null;
registerFont('./assets/fonts/splatoonfont.ttf', { family: 'SplatoonFont' });

async function fetchAndStoreJSON() {
    try {
        console.log('Downloading JSON...');
        const response = await axios.get(TRANSLATION_URL);
        translationData = response.data;
        console.log('JSON stored in memory');
    } catch (error) {
        console.error('Error downloading JSON:', error.message);
    }
}

function fetchWeaponName(variableKey) {
    if (translationData && translationData.weapons && translationData.weapons[variableKey]) {
        const weapon = translationData.weapons[variableKey];
        return weapon.name;
    } else {
        console.log(`Weapon with key ${variableKey} not found.`);
        return null;
    }
}

function fetchStageName(variableKey) {
    if (translationData && translationData.stages && translationData.stages[variableKey]) {
        const stage = translationData.stages[variableKey];
        return stage.name;
    } else {
        console.log(`Stage with key ${variableKey} not found.`);
        return null;
    }
}

async function fetchSchedule(sendImmediately = true) {
    try {
        console.log("Fetching schedule...");

        const response = await axios.get(SCHEDULE_URL);
        const nodes = response.data.data.coopGroupingSchedule.regularSchedules.nodes;

        if (!nodes || nodes.length === 0) throw new Error("No schedule data available");

        let selectedNode = null;

        // Find the first valid node where endTime is in the future
        for (const node of nodes) {
            const endTime = new Date(node.endTime);
            const curDate = new Date();
            if (endTime > curDate) {
                selectedNode = node;
                break;
            }
        }

        if (!selectedNode) throw new Error("No valid schedule data available");

        const { startTime, endTime, setting } = selectedNode;

        // If `sendImmediately` is false, wait until `endTime` to send the schedule
        if (!sendImmediately) {
            const timeDifference = new Date(endTime) - new Date();

            if (timeDifference > 0) {
                console.log(`Next schedule will be sent in ${timeDifference / 1000 / 60} minutes`);
                setTimeout(() => fetchSchedule(true), timeDifference);
                return; // Stop further processing until timeout executes
            }
        }

        // Process and send the schedule if `sendImmediately` is true
        const { boss, coopStage, weapons } = setting;

        console.log("Downloading images...");
        const stageImagePath = await downloadImage(coopStage.image.url, 'stage.png');
        const weaponPaths = await Promise.all(
            weapons.map((weapon, index) => downloadImage(weapon.image.url, `weapon${index + 1}.png`))
        );

        const stageName = fetchStageName(coopStage.id);

        console.log("Creating merged image...");
        const finalImagePath = await createMergedImage(stageImagePath, weaponPaths, stageName, boss.id);

        let textMessage = "";
        textMessage += `현재 스테이지는 **${stageName}**!\n`;
        textMessage += `시작: <t:${new Date(startTime).getTime() / 1000}:F>\n끝: <t:${new Date(endTime).getTime() / 1000}:F>\n`;

        textMessage += "### 무기:\n";
        weapons.forEach((weapon) => {
            const weaponName = fetchWeaponName(weapon.__splatoon3ink_id);
            textMessage += `> - ${weaponName}\n`;
        });

        console.log("Sending image to Discord...");
        const channel = await client.channels.fetch(SCHEDULE_CHANNEL);
        const imageAttachment = new AttachmentBuilder(finalImagePath, { name: 'currentSalmon.png' });

        const embed = new EmbedBuilder()
            .setTitle('새먼런 로테이션 변경!')
            .setDescription(textMessage)
            .setImage('attachment://currentSalmon.png')
            .setColor('#ffcc00')
            .setTimestamp();

        await channel.send({
            embeds: [embed],
            files: [imageAttachment],
        });

        // Schedule the next fetch based on `endTime`
        const timeDifference = new Date(endTime) - new Date();
        console.log(`Next fetch will be in ${timeDifference / 1000 / 60 / 60} hours`);
        setTimeout(fetchSchedule, timeDifference);

    } catch (error) {
        console.error("Error fetching schedule:", error.message);
    }
}



async function downloadImage(url, fileName) {
    const dirPath = _resolve(__dirname, '../assets');
    const filePath = _resolve(dirPath, fileName);

    // Create the directory if it doesn't exist
    mkdirSync(dirPath, { recursive: true });

    const response = await axios.get(url, { responseType: 'arraybuffer' });
    writeFileSync(filePath, response.data);
    return filePath;
}

// Create the merged image
async function createMergedImage(stageImagePath, weaponPaths, stageName="", bossId = "") {
    const canvas = createCanvas(1280, 720); 
    const ctx = canvas.getContext('2d');

    // Load background canvas
    const overlayImage = await loadImage('assets/sroverlay.png');

    let bgCanvas;

    switch (bossId) {
        case "Q29vcEVuZW15LTIz":
            bgCanvas = await loadImage('assets/kingbig.png');
            break;
        case "Q29vcEVuZW15LTI0":
            bgCanvas = await loadImage('assets/kingyong.png');
            break;
        case "Q29vcEVuZW15LTI1":
            bgCanvas = await loadImage('assets/kingjoe.png');
            break;
        case "Q29vcEVuZW15LTMw":
            bgCanvas = await loadImage('assets/kingtri.png');
            break;
        default:
            bgCanvas = await loadImage('assets/kingdefault.png');
    }
    ctx.drawImage(bgCanvas, 0, 0, canvas.width, canvas.height);

    // Load and draw the stage image at the specified coordinates and size
    const stageImage = await loadImage(stageImagePath);
    const stageX = 62;
    const stageY = 207; 
    const stageWidth = 800; 
    const stageHeight = 450; 
    ctx.drawImage(stageImage, stageX, stageY, stageWidth, stageHeight);

    ctx.drawImage(overlayImage, 0, 0, canvas.width, canvas.height);

    // Load and draw weapon images at the specified coordinates and size
    const weaponSize = 153;
    const weaponPositions = [
        { x: 896, y: 224 },
        { x: 1095, y: 224 },
        { x: 896, y: 430 },
        { x: 1095, y: 430 }
    ];

    for (let i = 0; i < weaponPaths.length; i++) {
        const weaponPath = weaponPaths[i];
        const weaponImage = await loadImage(weaponPath);
        const weaponX = weaponPositions[i].x;
        const weaponY = weaponPositions[i].y;
        ctx.drawImage(weaponImage, weaponX, weaponY, weaponSize, weaponSize);
    }

    const fontSize = 40;
    ctx.font = `${fontSize}px SplatoonFont`; 
    ctx.fillStyle = 'white';  
    ctx.textAlign = 'center'; 
    ctx.textBaseline = 'middle';
    ctx.fillText(stageName, 700, 635);

    // Save final image to file
    const outputPath = _resolve(__dirname, '../assets/finalImage.png');
    const out = createWriteStream(outputPath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);

    return new Promise((resolve) => {
        out.on('finish', () => resolve(outputPath));
    });
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    await fetchAndStoreJSON();
    fetchSchedule(false); // Start without sending the current schedule
});


// Login to Discord
client.login(process.env.DISCORD_TOKEN);


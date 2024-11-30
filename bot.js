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

async function fetchSchedule() {
    try {
        console.log("Fetching schedule...");
        const response = await axios.get(SCHEDULE_URL);
        const nodes = response.data.data.coopGroupingSchedule.regularSchedules.nodes;

        if (!nodes || nodes.length === 0) throw new Error("No schedule data available");

        // Process the schedule data
        const { startTime, endTime, setting } = nodes[0];
        const { boss, coopStage, weapons } = setting;
        console.log(coopStage.image.url);

        console.log("Downloading images...");
        const stageImagePath = await downloadImage(coopStage.image.url, 'stage.png');
        const weaponPaths = await Promise.all(
            weapons.map((weapon, index) => downloadImage(weapon.image.url, `weapon${index + 1}.png`))
        );

        const stageName = fetchStageName(coopStage.id);

        console.log("Creating merged image...");
        const finalImagePath = await createMergedImage(stageImagePath, weaponPaths, stageName, boss.id);

        // Define the text message you want to send
        let textMessage = "";

        textMessage += `현재 스테이지는 **${stageName}**!\n`;
        textMessage += `**시작: <t:${new Date(startTime).getTime() / 1000}:F>**\n끝: <t:${new Date(endTime).getTime() / 1000}:F>\n`;


        textMessage += "### 무기:\n"; // Replace with the dynamic message you want to send
        
        weapons.forEach((weapon) => {
            const weaponName = fetchWeaponName(weapon.__splatoon3ink_id); // Assuming each weapon has an `id` field
            textMessage += `> - ${weaponName}\n`;
        });

        console.log("Sending image to Discord...");
        // Send the image with text to Discord channel
        const channel = await client.channels.fetch(SCHEDULE_CHANNEL); // Fetch channel using the channel ID from .env
        const imageAttachment = new AttachmentBuilder(finalImagePath, { name: 'currentSalmon.png' });

        const embed = new EmbedBuilder()
            .setTitle('새먼런 로테이션 변경!')
            .setDescription(textMessage) 
            .setImage('attachment://currentSalmon.png') 
            .setColor('#ffcc00')
            .setFooter({ text: `시작: <t:${new Date(startTime).getTime() / 1000}:F> 끝: <t:${new Date(endTime).getTime() / 1000}:F>` })
            .setTimestamp(); 
            

        const message = await channel.send({
            embeds: [embed],
            files: [imageAttachment],
        });

        // Calculate the time difference from now to `endTime` to schedule the next fetch
        const now = new Date();
        const nextFetchTime = new Date(endTime);
        const timeDifference = nextFetchTime - now;

        if (timeDifference > 0) {
            console.log(`Next fetch will be in ${timeDifference / 1000 / 60 / 60} hours`);
            setTimeout(fetchSchedule, timeDifference); // Schedule the next fetch based on `endTime`
        } else {
            console.log("The scheduled end time has already passed, fetching schedule again...");
            setTimeout(fetchSchedule, 0); // Immediate re-fetch if the scheduled time has passed
        }

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
    fetchSchedule(); // Fetch data on startup
});

// Login to Discord
console.log(process.env.DISCORD_TOKEN);
client.login(process.env.DISCORD_TOKEN);


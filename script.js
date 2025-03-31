// --- Basic Setup ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const feedbackDiv = document.getElementById('feedback');
const startButton = document.getElementById('startButton');
const pauseButton = document.getElementById('pauseButton');
const exitButton = document.getElementById('exitButton');
const gameContainer = document.getElementById('game-container');

let canvasWidth, canvasHeight;

// --- Constants ---
const MIN_NUMBER = 1;
const MAX_NUMBER = 10; // Change to 20 if needed
const NUM_ITEMS_ON_SCREEN = 5;
const NUMBER_FONT_SIZE_BASE = 60; // Base font size, will scale
const FEEDBACK_FONT_SIZE_BASE = 30;
const BUTTON_AREA_HEIGHT = 60; // Approx height of top bar in pixels
const PARTICLE_COUNT = 50;
const AUDIO_REPEAT_DELAY_MS = 5000; // 5 seconds
const FEEDBACK_DURATION_MS = 2000; // 2 seconds

// --- Game State Variables ---
let gameState = 'START_MENU'; // START_MENU, PLAYING, PAUSED, CORRECT_FEEDBACK, WRONG_FEEDBACK
let pausedFromState = '';
let targetNumber = -1;
let numbersOnScreen = []; // { value: number, x: num, y: num, width: num, height: num, color: str, rect: DOMRect }
let particles = [];
let feedbackTimeout = null;
let audioCueTimeout = null;
let lastInteractionTime = 0; // Track user interaction for audio autoplay

// --- Sound Loading (Web Audio API is more robust, but <audio> is simpler) ---
const sounds = {};
function loadSounds() {
    try {
        console.log("Attempting to load MP3 sounds..."); // Added console log
        for (let i = MIN_NUMBER; i <= MAX_NUMBER; i++) {
            // Assumes sounds are in a 'sounds' subfolder and are now MP3s
            // **** CHANGE HERE ****
            sounds[i] = new Audio(`sounds/${i}.mp3`);
            // Add error handling for individual files if needed
            sounds[i].onerror = () => console.error(`Failed to load sound: sounds/${i}.mp3`);
        }
         // **** CHANGE HERE ****
        sounds.good_job = new Audio('sounds/good_job.mp3');
        sounds.good_job.onerror = () => console.error(`Failed to load sound: sounds/good_job.mp3`);

        // **** CHANGE HERE ****
        sounds.wrong_answer = new Audio('sounds/wrong_answer.mp3');
        sounds.wrong_answer.onerror = () => console.error(`Failed to load sound: sounds/wrong_answer.mp3`);

        console.log("Sound object references created (check network/console for loading errors).");
    } catch (e) {
        console.error("Error creating Audio objects:", e);
        feedbackDiv.textContent = "Error loading sounds.";
    }
}

// --- Particle Class ---
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = Math.random() * 6 - 3; // -3 to 3
        this.vy = Math.random() * 5 - 1; // -1 to 4 (mostly down)
        this.size = Math.random() * 5 + 4; // 4 to 9
        this.gravity = 0.15;
        this.alpha = 1.0; // For fading out
    }

    update(dt) { // dt is delta time (fraction of a second) - for frame-rate independence
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= 0.01; // Fade out
    }

    draw(ctx) {
        if (this.alpha > 0 && this.size > 1) {
            ctx.save(); // Save current context state
            ctx.globalAlpha = this.alpha; // Apply fade
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
            ctx.restore(); // Restore context state
        }
    }
}

// --- Helper Functions ---
function resizeCanvas() {
    // Make canvas resolution match its display size
    const containerRect = gameContainer.getBoundingClientRect();
    canvas.width = containerRect.width;
    canvas.height = containerRect.height - BUTTON_AREA_HEIGHT; // Adjust for button bar
    canvasWidth = canvas.width;
    canvasHeight = canvas.height;
    console.log(`Canvas resized to: ${canvasWidth}x${canvasHeight}`);
    // Redraw immediately after resize
    if(gameState !== 'START_MENU') draw();
}

function getNumberFontSize() {
    // Scale font size based on canvas width (adjust multiplier as needed)
    return Math.max(24, Math.min(NUMBER_FONT_SIZE_BASE, canvasWidth / 10));
}

function getFeedbackFontSize() {
     return Math.max(18, Math.min(FEEDBACK_FONT_SIZE_BASE, canvasWidth / 18));
}


function getRandomColor() {
    const colors = ['#0000FF', '#FF0000', '#008000', '#000000', '#FFA500', '#800080']; // Blue, Red, Green, Black, Orange, Purple
    return colors[Math.floor(Math.random() * colors.length)];
}

function generateNumbers(targetNum) {
    numbersOnScreen = [];
    const existingRects = [];
    const fontSize = getNumberFontSize();
    ctx.font = `bold ${fontSize}px sans-serif`; // Set font to measure text

    const numList = [targetNum];
    let possibleNums = Array.from({ length: MAX_NUMBER - MIN_NUMBER + 1 }, (_, i) => i + MIN_NUMBER);
    possibleNums = possibleNums.filter(n => n !== targetNum);

    const numDistractorsToPick = Math.min(possibleNums.length, NUM_ITEMS_ON_SCREEN - 1);
    for (let i = 0; i < numDistractorsToPick; i++) {
        const randIndex = Math.floor(Math.random() * possibleNums.length);
        numList.push(possibleNums.splice(randIndex, 1)[0]);
    }
    // Shuffle
    numList.sort(() => Math.random() - 0.5);

    for (const num of numList) {
        const text = String(num);
        const metrics = ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = fontSize; // Approximate height
        const padding = 15; // Padding around numbers for collision and clicking

        let attempts = 0;
        let placed = false;
        while (attempts < 100 && !placed) {
            // Ensure numbers are fully within bounds and below button bar
            const randX = Math.random() * (canvasWidth - textWidth - padding * 2) + padding + textWidth / 2;
             // Y position needs to be below button area
            const randY = Math.random() * (canvasHeight - textHeight - padding*2) + padding + textHeight/2;


            const numRect = {
                x: randX - textWidth / 2 - padding, // Top-left x for collision rect
                y: randY - textHeight / 2 - padding, // Top-left y
                width: textWidth + padding * 2,
                height: textHeight + padding * 2,
                centerX: randX,
                centerY: randY
            };

            let overlaps = false;
            for (const existing of existingRects) {
                // Simple AABB collision check
                if (numRect.x < existing.x + existing.width &&
                    numRect.x + numRect.width > existing.x &&
                    numRect.y < existing.y + existing.height &&
                    numRect.y + numRect.height > existing.y) {
                    overlaps = true;
                    break;
                }
            }

            if (!overlaps) {
                numbersOnScreen.push({
                    value: num,
                    x: numRect.centerX, // Center coordinates for drawing text
                    y: numRect.centerY,
                    width: textWidth,   // Actual text width
                    height: textHeight, // Actual text height
                    rect: numRect,      // Bounding box for clicks/collisions
                    color: getRandomColor()
                });
                existingRects.push(numRect);
                placed = true;
            }
            attempts++;
        }
        if (!placed) console.warn(`Could not place number ${num} without overlap.`);
    }
     console.log("Generated numbers:", numbersOnScreen);
}

function createParticles(centerX, centerY, color) {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(new Particle(centerX, centerY, color));
    }
}

function updateFeedback(message, type) {
    feedbackDiv.textContent = message;
    feedbackDiv.className = `feedback-${type}`; // Apply CSS class
    clearTimeout(feedbackTimeout); // Clear previous timer if any

    if (type === 'correct' || type === 'wrong') {
        feedbackTimeout = setTimeout(() => {
            if(gameState === 'CORRECT_FEEDBACK' && type === 'correct') {
                 // Transition to next number after correct feedback timeout
                startNewRound();
            } else if (gameState === 'WRONG_FEEDBACK' && type === 'wrong') {
                // Go back to playing state after wrong feedback timeout
                 gameState = 'PLAYING';
                 feedbackDiv.textContent = '';
                 feedbackDiv.className = '';
                 // Restart audio cue timer
                 resetAudioCueTimer();
            } else {
                 // General clear if state changed elsewhere
                 feedbackDiv.textContent = '';
                 feedbackDiv.className = '';
            }
        }, FEEDBACK_DURATION_MS);
    }
}


function resetAudioCueTimer() {
    clearTimeout(audioCueTimeout);
    if (gameState === 'PLAYING' && targetNumber !== -1) {
        audioCueTimeout = setTimeout(() => {
            playSound(targetNumber);
            resetAudioCueTimer(); // Schedule the next one
        }, AUDIO_REPEAT_DELAY_MS);
    }
}

function startNewRound() {
    targetNumber = Math.floor(Math.random() * (MAX_NUMBER - MIN_NUMBER + 1)) + MIN_NUMBER;
    generateNumbers(targetNumber);
    particles = [];
    gameState = 'PLAYING';
    feedbackDiv.textContent = '';
    feedbackDiv.className = '';
    clearTimeout(feedbackTimeout); // Ensure no old feedback timer runs
    playSound(targetNumber);
    resetAudioCueTimer();
    console.log(`New round. Target: ${targetNumber}`);
}

// --- Drawing Functions ---
function draw() {
    // Clear canvas
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw based on state
    if (gameState === 'START_MENU') {
        ctx.fillStyle = 'black';
        ctx.font = `bold ${getFeedbackFontSize()}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText("Click 'Start' to Play!", canvasWidth / 2, canvasHeight / 2);
    } else if (gameState === 'PAUSED') {
        // Draw the underlying state first (numbers)
        drawNumbers();
        // Draw overlay
        ctx.fillStyle = 'rgba(128, 128, 128, 0.7)';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.fillStyle = 'white';
        ctx.font = `bold ${getNumberFontSize()}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText("Paused", canvasWidth / 2, canvasHeight / 2);
    } else { // PLAYING, CORRECT_FEEDBACK, WRONG_FEEDBACK
        // Draw numbers
        drawNumbers();

        // Draw particles if animating
        if (gameState === 'CORRECT_FEEDBACK') {
            particles.forEach(p => p.draw(ctx));
        }
    }
}

function drawNumbers() {
     const fontSize = getNumberFontSize();
     ctx.font = `bold ${fontSize}px sans-serif`;
     ctx.textAlign = 'center';
     ctx.textBaseline = 'middle'; // Vertically center text

     numbersOnScreen.forEach(numInfo => {
        ctx.fillStyle = numInfo.color;
        // Use the center coordinates stored in numInfo
        ctx.fillText(String(numInfo.value), numInfo.x, numInfo.y);
        // Optional: Draw bounding box for debugging clicks
        // ctx.strokeStyle = 'red';
        // ctx.strokeRect(numInfo.rect.x, numInfo.rect.y, numInfo.rect.width, numInfo.rect.height);
     });
}

// --- Update Functions ---
function update(dt) {
    if (gameState === 'CORRECT_FEEDBACK') {
        particles.forEach(p => p.update(dt));
        // Remove dead particles
        particles = particles.filter(p => p.alpha > 0);
    }
}

// --- Game Loop ---
let lastTime = 0;
function gameLoop(timestamp) {
    const dt = (timestamp - lastTime) / 1000; // Delta time in seconds
    lastTime = timestamp;

    if (gameState !== 'PAUSED') {
        update(dt); // Update particle positions etc.
    }
    draw(); // Draw everything

    requestAnimationFrame(gameLoop); // Keep the loop going
}

// --- Event Listeners ---
function handleInteraction(event) {
    event.preventDefault(); // Prevent scrolling/zooming on touch

    lastInteractionTime = Date.now(); // Record interaction for audio playback

    // Get click/touch coordinates relative to the canvas
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if (event.type === 'touchstart') {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else { // 'click'
        clientX = event.clientX;
        clientY = event.clientY;
    }

    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;

    // Only process clicks if playing
    if (gameState === 'PLAYING') {
        let clickedNumber = false;
        for (let i = numbersOnScreen.length - 1; i >= 0; i--) { // Loop backwards for safe removal
            const numInfo = numbersOnScreen[i];
            // Check if click is within the number's bounding rectangle
            if (canvasX >= numInfo.rect.x && canvasX <= numInfo.rect.x + numInfo.rect.width &&
                canvasY >= numInfo.rect.y && canvasY <= numInfo.rect.y + numInfo.rect.height) {

                clickedNumber = true;
                if (numInfo.value === targetNumber) {
                    // CORRECT!
                    gameState = 'CORRECT_FEEDBACK';
                    updateFeedback('Good Job!', 'correct');
                    playSound('good_job');
                    createParticles(numInfo.x, numInfo.y, numInfo.color);
                    numbersOnScreen.splice(i, 1); // Remove the number
                    clearTimeout(audioCueTimeout); // Stop repeating cue
                } else {
                    // WRONG!
                    gameState = 'WRONG_FEEDBACK';
                    updateFeedback('Wrong answer, try again', 'wrong');
                    playSound('wrong_answer');
                    // Don't reset audio cue timer on wrong answer
                }
                break; // Stop checking once a number is hit
            }
        }
    }
}

startButton.addEventListener('click', () => {
    lastInteractionTime = Date.now();
    if (gameState === 'START_MENU' || gameState === 'PAUSED') { // Allow restart from pause? Or only start menu?
        startNewRound();
        pauseButton.textContent = 'Pause';
    }
});

pauseButton.addEventListener('click', () => {
    lastInteractionTime = Date.now();
    if (gameState === 'PLAYING' || gameState === 'WRONG_FEEDBACK') {
        pausedFromState = gameState;
        gameState = 'PAUSED';
        pauseButton.textContent = 'Resume';
        clearTimeout(audioCueTimeout); // Stop audio cue timer
        clearTimeout(feedbackTimeout); // Stop feedback timer
        // Maybe pause sounds here if using Web Audio API
    } else if (gameState === 'PAUSED') {
        gameState = pausedFromState;
        pauseButton.textContent = 'Pause';
        resetAudioCueTimer(); // Restart audio cue timer
         // Restore feedback if it was active (might need more state)
        if (pausedFromState === 'WRONG_FEEDBACK') {
             updateFeedback('Wrong answer, try again', 'wrong');
        }

    }
});

exitButton.addEventListener('click', () => {
    // Simple exit: go back to start menu state
    gameState = 'START_MENU';
    targetNumber = -1;
    numbersOnScreen = [];
    particles = [];
    feedbackDiv.textContent = '';
    feedbackDiv.className = '';
    clearTimeout(feedbackTimeout);
    clearTimeout(audioCueTimeout);
    pauseButton.textContent = 'Pause';
    // Optionally: window.close(); or history.back(); but these have limitations
});

// Use 'click' for mouse and 'touchstart' for touch devices
canvas.addEventListener('click', handleInteraction);
canvas.addEventListener('touchstart', handleInteraction);

// Resize canvas initially and on window resize
window.addEventListener('resize', resizeCanvas);


// --- Initial Load ---
resizeCanvas(); // Set initial size
loadSounds(); // Load sound file references
requestAnimationFrame(gameLoop); // Start the game loop
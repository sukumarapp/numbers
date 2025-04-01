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

// --- Sound Loading ---
const sounds = {};
function loadSounds() {
    try {
        console.log("Attempting to load MP3 sounds...");
        for (let i = MIN_NUMBER; i <= MAX_NUMBER; i++) {
            // Assumes sounds are in a 'sounds' subfolder and are now MP3s
            sounds[i] = new Audio(`sounds/${i}.mp3`);
            sounds[i].onerror = () => console.error(`Failed to load sound: sounds/${i}.mp3`);
        }
        sounds.good_job = new Audio('sounds/good_job.mp3');
        sounds.good_job.onerror = () => console.error(`Failed to load sound: sounds/good_job.mp3`);

        sounds.wrong_answer = new Audio('sounds/wrong_answer.mp3');
        sounds.wrong_answer.onerror = () => console.error(`Failed to load sound: sounds/wrong_answer.mp3`);

        console.log("Sound object references created (check network/console for loading errors).");
    } catch (e) {
        console.error("Error creating Audio objects:", e);
        feedbackDiv.textContent = "Error loading sounds.";
    }
}

// **** playSound FUNCTION MOVED HERE - BEFORE IT'S CALLED ****
function playSound(soundName) {
    const sound = sounds[soundName]; // Get the audio object
    console.log(`Attempting to play: ${soundName}`, sound); // Log the attempt and the object

    // Check if the sound object actually exists
    if (!sound) {
        console.error(`Sound object for "${soundName}" is missing or failed to load.`);
        return; // Exit if sound doesn't exist
    }

    // Browser audio interaction check
    // Allow feedback sounds immediately after click, or any sound if recent interaction
    if (Date.now() - lastInteractionTime < 1500 || soundName === 'good_job' || soundName === 'wrong_answer') { // Increased time slightly
        console.log(`Interaction check passed for ${soundName}. Playing...`);
        sound.currentTime = 0; // Rewind before playing
        sound.play().then(() => {
            // Optional: Log success
            // console.log(`Playback successful for ${soundName}`);
        }).catch(e => {
            // THIS IS IMPORTANT - logs if the browser blocks playback
            console.error(`Audio play failed for ${soundName}:`, e);
            // If you see "NotAllowedError", it's the autoplay policy
        });
    } else {
        console.log(`Audio skipped for ${soundName}: No recent user interaction.`);
    }
}
// **** END OF playSound FUNCTION ****


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
    // Ensure container has dimensions before proceeding
    if (containerRect.width === 0 || containerRect.height === 0) return;

    canvas.width = containerRect.width;
     // Estimate button bar height dynamically or use a fixed value assumed by CSS
    const topBarHeight = document.getElementById('top-bar').offsetHeight || BUTTON_AREA_HEIGHT;
    canvas.height = containerRect.height - topBarHeight;

    canvasWidth = canvas.width;
    canvasHeight = canvas.height;
    console.log(`Canvas resized to: ${canvasWidth}x${canvasHeight}`);
    // Redraw immediately after resize only if game is active
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
    // Ensure canvas dimensions are valid before proceeding
    if (!canvasWidth || !canvasHeight || canvasHeight <=0) {
        console.warn("Canvas dimensions not set, cannot generate numbers.");
        return;
    }

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
        // Using font bounding box ascent/descent for more accurate height estimate if available
        const textHeight = metrics.actualBoundingBoxAscent && metrics.actualBoundingBoxDescent ?
                           metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent :
                           fontSize; // Fallback to fontSize
        const padding = 15; // Padding around numbers for collision and clicking

        let attempts = 0;
        let placed = false;
        while (attempts < 100 && !placed) {
             // Ensure numbers are fully within bounds
            const minX = padding + textWidth / 2;
            const maxX = canvasWidth - padding - textWidth / 2;
            const minY = padding + textHeight / 2; // Y position starts below button area conceptually
            const maxY = canvasHeight - padding - textHeight / 2;

            if (maxX <= minX || maxY <= minY) {
                console.warn("Canvas too small to place numbers.");
                break; // Prevent infinite loop if canvas is too small
            }

            const randX = Math.random() * (maxX - minX) + minX;
            const randY = Math.random() * (maxY - minY) + minY;

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
        if (!placed && maxX > minX && maxY > minY) console.warn(`Could not place number ${num} without overlap.`);
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
    feedbackDiv.className = type ? `feedback-${type}` : ''; // Apply CSS class or remove if no type

    clearTimeout(feedbackTimeout); // Clear previous timer if any

    // Only set a timeout to clear feedback or move on if it's timed feedback
    if ((type === 'correct' || type === 'wrong') && FEEDBACK_DURATION_MS > 0) {
        feedbackTimeout = setTimeout(() => {
            // Check the state *when the timeout fires*
            if(gameState === 'CORRECT_FEEDBACK' && type === 'correct') {
                 startNewRound();
            } else if (gameState === 'WRONG_FEEDBACK' && type === 'wrong') {
                 gameState = 'PLAYING';
                 updateFeedback('', null); // Clear feedback text visually
                 resetAudioCueTimer(); // Restart cue timer after wrong answer shown
            } else {
                 // If state changed (e.g., paused, exited) while feedback was showing, just clear visually
                 updateFeedback('', null);
            }
        }, FEEDBACK_DURATION_MS);
    } else if (!type) {
        // If explicitly clearing feedback (type is null/undefined), ensure text is gone
        feedbackDiv.textContent = '';
        feedbackDiv.className = '';
    }
}


function resetAudioCueTimer() {
    clearTimeout(audioCueTimeout);
    if (gameState === 'PLAYING' && targetNumber !== -1) {
        audioCueTimeout = setTimeout(() => {
            playSound(targetNumber); // Play the cue
            resetAudioCueTimer(); // Schedule the *next* one
        }, AUDIO_REPEAT_DELAY_MS);
    }
}

function startNewRound() {
    targetNumber = Math.floor(Math.random() * (MAX_NUMBER - MIN_NUMBER + 1)) + MIN_NUMBER;
    generateNumbers(targetNumber); // Generate positions for numbers
    particles = []; // Clear any old particles
    gameState = 'PLAYING';
    updateFeedback('', null); // Clear any previous feedback immediately
    clearTimeout(feedbackTimeout); // Ensure no old feedback timer runs

    // **** ADD THIS LINE ****
    lastInteractionTime = Date.now(); // Update interaction time just before the next cue

    // Play the sound *after* a tiny delay
    setTimeout(() => playSound(targetNumber), 50);

    resetAudioCueTimer(); // Start the timer for the *next* repetition
    console.log(`New round. Target: ${targetNumber}`);
}

// --- Drawing Functions ---
function draw() {
     // Ensure canvas context is available
    if (!ctx) return;

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
     if (!ctx || !canvasWidth) return; // Ensure context and dimensions are ready
     const fontSize = getNumberFontSize();
     ctx.font = `bold ${fontSize}px sans-serif`;
     ctx.textAlign = 'center';
     ctx.textBaseline = 'middle'; // Vertically center text

     numbersOnScreen.forEach(numInfo => {
        ctx.fillStyle = numInfo.color;
        // Use the center coordinates stored in numInfo
        ctx.fillText(String(numInfo.value), numInfo.x, numInfo.y);
     });
}

// --- Update Functions ---
function update(dt) {
    // Only update particles if in the correct state
    if (gameState === 'CORRECT_FEEDBACK') {
        let anyActive = false;
        particles.forEach(p => {
            p.update(dt);
            if (p.alpha > 0) { // Check if particle is still visible
                anyActive = true;
            }
        });
        // Optimization: filter particles only once per frame if needed, or let them fade out naturally
        // particles = particles.filter(p => p.alpha > 0);
    }
}


// --- Game Loop ---
let lastTime = 0;
function gameLoop(timestamp) {
    // Ensure timestamp is valid
    if (!lastTime) lastTime = timestamp;
    const dt = (timestamp - lastTime) / 1000; // Delta time in seconds
    lastTime = timestamp;

    // Only update game logic if not paused
    if (gameState !== 'PAUSED' && gameState !== 'START_MENU') {
        update(dt); // Update particle positions etc.
    }
    // Always draw the current state
    draw();

    requestAnimationFrame(gameLoop); // Keep the loop going
}

// --- Event Listeners ---
function handleInteraction(event) {
    event.preventDefault(); // Prevent defaults like scrolling/zooming on touch

    // Record interaction time - crucial for audio autoplay policies
    lastInteractionTime = Date.now();

    // Get click/touch coordinates relative to the canvas
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    // Handle both mouse clicks and touch events
    if (event.type === 'touchstart') {
        if (!event.touches || event.touches.length === 0) return; // No touch data
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else { // 'click' or other pointer events
        clientX = event.clientX;
        clientY = event.clientY;
    }

     // Calculate coordinates relative to the canvas element
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;

    // Only process clicks/taps if the game is in the playing state
    if (gameState === 'PLAYING') {
        let clickedNumber = false;
        // Iterate backwards through the numbers array allows safe removal using splice
        for (let i = numbersOnScreen.length - 1; i >= 0; i--) {
            const numInfo = numbersOnScreen[i];

            // Simple bounding box check for collision
            if (canvasX >= numInfo.rect.x && canvasX <= numInfo.rect.x + numInfo.rect.width &&
                canvasY >= numInfo.rect.y && canvasY <= numInfo.rect.y + numInfo.rect.height) {

                clickedNumber = true; // A number was hit

                if (numInfo.value === targetNumber) {
                    // CORRECT Answer!
                    gameState = 'CORRECT_FEEDBACK';
                    updateFeedback('Good Job!', 'correct'); // Display feedback
                    playSound('good_job'); // Play success sound
                    createParticles(numInfo.x, numInfo.y, numInfo.color); // Start particle animation
                    numbersOnScreen.splice(i, 1); // Remove the correctly clicked number from the screen
                    clearTimeout(audioCueTimeout); // Stop the repeating audio cue
                } else {
                    // WRONG Answer!
                    gameState = 'WRONG_FEEDBACK';
                    updateFeedback('Wrong answer, try again', 'wrong'); // Display feedback
                    playSound('wrong_answer'); // Play failure sound
                    // Do not reset audio cue timer - let them hear the target again if needed
                }
                break; // Exit loop once a number is clicked (correct or wrong)
            }
        }
    }
}

startButton.addEventListener('click', () => {
    lastInteractionTime = Date.now(); // Record interaction
    // Start the game if it's the initial state or potentially if paused (optional restart)
    if (gameState === 'START_MENU' || gameState === 'PAUSED') {
        startNewRound(); // Initialize and start the first/next round
        pauseButton.textContent = 'Pause'; // Ensure pause button text is correct
        pauseButton.disabled = false; // Enable pause button
    }
});

pauseButton.addEventListener('click', () => {
    lastInteractionTime = Date.now(); // Record interaction
    if (gameState === 'PLAYING' || gameState === 'WRONG_FEEDBACK') {
        // Pause the game
        pausedFromState = gameState; // Remember where we paused from
        gameState = 'PAUSED';
        pauseButton.textContent = 'Resume'; // Change button text
        clearTimeout(audioCueTimeout); // Stop repeating cues
        clearTimeout(feedbackTimeout); // Stop any active feedback timer
        updateFeedback('', null); // Clear feedback text visually
        // Note: <audio> elements don't have a built-in pause-all like pygame.mixer
    } else if (gameState === 'PAUSED') {
        // Resume the game
        gameState = pausedFromState; // Restore previous state
        pauseButton.textContent = 'Pause'; // Change button text back
        // If resuming into a state that needs timers, reset them
        if (gameState === 'PLAYING' || gameState === 'WRONG_FEEDBACK') {
            resetAudioCueTimer();
        }
         // Restore feedback visually if it was active (e.g., wrong answer)
        if (pausedFromState === 'WRONG_FEEDBACK') {
             updateFeedback('Wrong answer, try again', 'wrong');
        }
    }
});

exitButton.addEventListener('click', () => {
    // Reset game to initial state
    gameState = 'START_MENU';
    targetNumber = -1;
    numbersOnScreen = [];
    particles = [];
    updateFeedback('', null); // Clear feedback display
    clearTimeout(feedbackTimeout);
    clearTimeout(audioCueTimeout);
    pauseButton.textContent = 'Pause';
    pauseButton.disabled = true; // Disable pause button in start menu
    draw(); // Redraw to show start menu immediately
});

// Add listeners for both mouse and touch input
canvas.addEventListener('click', handleInteraction);
canvas.addEventListener('touchstart', handleInteraction);

// Handle window resizing
window.addEventListener('resize', resizeCanvas);


// --- Initial Load ---
// Disable pause button initially
pauseButton.disabled = true;
loadSounds(); // Load sound file references
// Wait a brief moment for layout, then size canvas and start loop
setTimeout(() => {
    resizeCanvas(); // Set initial size based on CSS layout
    requestAnimationFrame(gameLoop); // Start the main game loop
}, 100); // Delay slightly for initial rendering

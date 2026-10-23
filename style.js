/**
 * ============================================
 * CRICKET BATTING MASTER - GAME ENGINE
 * ============================================
 * A complete interactive cricket batting game
 * built with vanilla JavaScript and HTML5 Canvas
 */

// ============================================
// GAME CONFIGURATION & CONSTANTS
// ============================================

const CONFIG = {
  // Canvas settings
  CANVAS_WIDTH: 1200,
  CANVAS_HEIGHT: 800,

  // Game modes
  MODE_PRACTICE: "practice",
  MODE_MATCH: "match",

  // Difficulty settings
  DIFFICULTY: {
    easy: { ballSpeed: 4, swingChance: 0, spinAmount: 0 },
    medium: { ballSpeed: 7, swingChance: 0.3, spinAmount: 0.5 },
    hard: { ballSpeed: 10, swingChance: 0.6, spinAmount: 1.2 },
  },

  // Match settings
  BALLS_PER_OVER: 6,

  // Timing windows (in pixels from perfect position)
  TIMING: {
    perfect: 15, // Perfect timing window
    good: 40, // Good timing window
    late: 70, // Late/early window
  },

  // Scoring
  RUNS: {
    perfect: [4, 6], // Perfect timing can give 4 or 6
    good: [1, 2], // Good timing can give 1 or 2
    late: [0, 1], // Late timing can give 0 or 1
    miss: 0, // Miss gives 0
  },

  // Physics
  GRAVITY: 0.3,
  BOUNCE_DAMPING: 0.7,

  // IPL Squads
  IPL_SQUADS: {
    CSK: ["MS Dhoni", "R Gaikwad", "R Jadeja", "S Dube", "A Rahane"],
    MI: ["R Sharma", "I Kishan", "S Yadav", "H Pandya", "T Varma"],
    RCB: ["V Kohli", "F du Plessis", "G Maxwell", "R Patidar", "D Karthik"],
    KKR: ["S Iyer", "A Russell", "R Singh", "S Narine", "V Iyer"],
    RR: ["S Samson", "Y Jaiswal", "J Buttler", "R Parag", "D Jurel"],
    DC: ["R Pant", "D Warner", "M Marsh", "P Shaw", "A Patel"],
    PBKS: ["S Dhawan", "S Curran", "L Livingstone", "J Bairstow", "P Singh"],
    SRH: ["P Cummins", "A Markram", "H Klaasen", "T Head", "A Sharma"],
    LSG: ["KL Rahul", "Q de Kock", "M Stoinis", "N Pooran", "A Badoni"],
    GT: ["S Gill", "K Williamson", "D Miller", "R Tewatia", "S Sudharsan"],
  },

  // Visual
  BAT_SWING_DURATION: 200, // ms
  BALL_TRAIL_LENGTH: 10,
};

// ============================================
// GAME STATE MANAGEMENT
// ============================================

class GameState {
  constructor() {
    this.reset();
    this.highScore = this.loadHighScore();
  }

  reset() {
    this.score = 0;
    this.wickets = 0;
    this.ballsFaced = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.gameMode = null;
    this.difficulty = null;
    this.targetBalls = Infinity;
    this.currentBall = null;
    this.balls = [];
    this.particles = [];
    this.bat = null;
    this.batsman = null;
    this.bowler = null;
    this.lastShot = null;
    this.strikeRate = 0;
  }

  loadHighScore() {
    const saved = localStorage.getItem("cricketMasterHighScore");
    return saved ? parseInt(saved) : 0;
  }

  saveHighScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem("cricketMasterHighScore", this.highScore);
      return true;
    }
    return false;
  }

  updateStrikeRate() {
    if (this.ballsFaced > 0) {
      this.strikeRate = ((this.score / this.ballsFaced) * 100).toFixed(1);
    } else {
      this.strikeRate = "0.0";
    }
  }

  isGameOver() {
    if (this.gameMode === CONFIG.MODE_MATCH) {
      return this.ballsFaced >= this.targetBalls || this.wickets >= 10;
    }
    return false;
  }
}

// ============================================
// AUDIO MANAGER
// ============================================

class AudioManager {
  constructor() {
    this.sounds = {};
    this.enabled = true;
    this.init();
  }

  init() {
    // Create synthesized sounds using Web Audio API
    this.audioContext = new (
      window.AudioContext || window.webkitAudioContext
    )();
  }

  playHit() {
    this.playTone(800, 0.1, "square");
    setTimeout(() => this.playTone(600, 0.15, "square"), 50);
  }

  playCheer() {
    // Simulated crowd cheer with multiple tones
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const freq = 400 + Math.random() * 400;
        this.playTone(freq, 0.3, "sine", 0.1);
      }, i * 50);
    }
  }

  playOut() {
    this.playTone(200, 0.3, "sawtooth");
    setTimeout(() => this.playTone(150, 0.4, "sawtooth"), 100);
  }

  playTone(frequency, duration, type = "sine", volume = 0.3) {
    if (!this.enabled || !this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      this.audioContext.currentTime + duration,
    );

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }
}

// ============================================
// GAME ENTITIES
// ============================================

class Ball {
  constructor(x, y, difficulty) {
    this.x = x;
    this.y = y;
    this.startX = x;
    this.startY = y;
    this.radius = 8;

    // Set speed based on difficulty
    const diff = CONFIG.DIFFICULTY[difficulty];
    this.speed = diff.ballSpeed + (Math.random() * 2 - 1);

    // Swing/spin
    this.swingChance = diff.swingChance;
    this.spinAmount = diff.spinAmount;
    this.swingDirection = Math.random() > 0.5 ? 1 : -1;

    // Movement
    this.vx = 0;
    this.vy = this.speed;
    this.trail = [];

    // State
    this.isHit = false;
    this.isOut = false;
    this.hasBounced = false;
    this.active = true;

    // Timing calculation
    this.perfectY = 0; // Will be set based on batsman position
  }

  update(batsmanY) {
    if (!this.active) return;

    // Store trail
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > CONFIG.BALL_TRAIL_LENGTH) {
      this.trail.shift();
    }

    if (this.isHit) {
      // Ball has been hit - apply physics
      this.vy += CONFIG.GRAVITY;
      this.x += this.vx;
      this.y += this.vy;

      // Ground bounce
      if (this.y > CONFIG.CANVAS_HEIGHT - 50 && !this.hasBounced) {
        this.vy *= -CONFIG.BOUNCE_DAMPING;
        this.vx *= 0.8;
        this.hasBounced = true;
      }

      // Deactivate if off screen
      if (
        this.x < -100 ||
        this.x > CONFIG.CANVAS_WIDTH + 100 ||
        this.y > CONFIG.CANVAS_HEIGHT + 100 ||
        this.y < -100
      ) {
        this.active = false;
      }
    } else {
      // Ball is still being bowled
      this.y += this.speed;

      // Apply swing
      if (Math.random() < this.swingChance) {
        this.x += this.swingDirection * this.spinAmount;
      }

      // Check if passed batsman (missed)
      if (this.y > batsmanY + 50 && !this.isHit) {
        this.isOut = true;
        this.active = false;
      }
    }
  }

  hit(power, direction, timing) {
    this.isHit = true;

    // Calculate hit power based on timing and shot type
    const basePower = power;
    const angle = direction * (Math.PI / 4); // Convert to radians

    this.vx = Math.sin(angle) * basePower * 15;
    this.vy = -Math.cos(angle) * basePower * 15;

    // Add some randomness
    this.vx += (Math.random() - 0.5) * 5;
  }

  draw(ctx) {
    // Draw trail
    ctx.save();
    for (let i = 0; i < this.trail.length; i++) {
      const point = this.trail[i];
      const alpha = (i / this.trail.length) * 0.5;
      const size = (i / this.trail.length) * this.radius;

      ctx.beginPath();
      ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fill();
    }
    ctx.restore();

    // Draw ball
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);

    // Ball gradient
    const gradient = ctx.createRadialGradient(
      this.x - 3,
      this.y - 3,
      0,
      this.x,
      this.y,
      this.radius,
    );
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.5, "#e0e0e0");
    gradient.addColorStop(1, "#a0a0a0");

    ctx.fillStyle = gradient;
    ctx.fill();

    // Ball seam
    ctx.strokeStyle = "#dc3545";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius - 2, 0.5, 2.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius - 2, 3.5, 5.5);
    ctx.stroke();

    ctx.restore();
  }
}

class Batsman {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.width = 40;
    this.height = 80;
    this.batAngle = 0;
    this.isSwinging = false;
    this.swingProgress = 0;
    this.swingStartTime = 0;
  }

  swing() {
    if (!this.isSwinging) {
      this.isSwinging = true;
      this.swingStartTime = Date.now();
      this.swingProgress = 0;
    }
  }

  update() {
    if (this.isSwinging) {
      const elapsed = Date.now() - this.swingStartTime;
      this.swingProgress = elapsed / CONFIG.BAT_SWING_DURATION;

      if (this.swingProgress >= 1) {
        this.isSwinging = false;
        this.swingProgress = 0;
        this.batAngle = 0;
      } else {
        // Bat swing arc
        this.batAngle = Math.sin(this.swingProgress * Math.PI) * 60;
      }
    }
  }

  draw(ctx) {
    ctx.save();

    // Draw body (simple representation)
    ctx.fillStyle = "#1a5f2a";
    ctx.fillRect(this.x - 15, this.y - 40, 30, 50);

    // Draw head
    ctx.beginPath();
    ctx.arc(this.x, this.y - 55, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#fdbcb4";
    ctx.fill();

    // Draw helmet
    ctx.beginPath();
    ctx.arc(this.x, this.y - 58, 14, Math.PI, 0);
    ctx.fillStyle = "#1a5f2a";
    ctx.fill();

    // Draw bat
    ctx.save();
    ctx.translate(this.x + 10, this.y - 20);
    ctx.rotate((this.batAngle * Math.PI) / 180);

    // Bat handle
    ctx.fillStyle = "#8b4513";
    ctx.fillRect(-3, -30, 6, 35);

    // Bat blade
    ctx.fillStyle = "#f5f5dc";
    ctx.fillRect(-8, -80, 16, 55);

    // Bat edges
    ctx.strokeStyle = "#d4af37";
    ctx.lineWidth = 2;
    ctx.strokeRect(-8, -80, 16, 55);

    ctx.restore();
    ctx.restore();
  }
}

class Bowler {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.animationFrame = 0;
  }

  draw(ctx, isBowling) {
    ctx.save();

    // Simple bowler representation
    ctx.fillStyle = "#dc3545";
    ctx.fillRect(this.x - 15, this.y - 40, 30, 50);

    // Head
    ctx.beginPath();
    ctx.arc(this.x, this.y - 55, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#fdbcb4";
    ctx.fill();

    // Cap
    ctx.beginPath();
    ctx.arc(this.x, this.y - 58, 13, Math.PI, 0);
    ctx.fillStyle = "#dc3545";
    ctx.fill();

    // Arm (animated if bowling)
    ctx.save();
    ctx.translate(this.x - 15, this.y - 30);
    if (isBowling) {
      this.animationFrame += 0.2;
      ctx.rotate(Math.sin(this.animationFrame) * 0.5);
    }
    ctx.fillStyle = "#fdbcb4";
    ctx.fillRect(-5, 0, 10, 30);
    ctx.restore();

    ctx.restore();
  }
}

class Particle {
  constructor(x, y, color, velocity) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.vx = velocity.x;
    this.vy = velocity.y;
    this.life = 1.0;
    this.decay = 0.02 + Math.random() * 0.03;
    this.size = 3 + Math.random() * 5;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.1; // gravity
    this.life -= this.decay;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Fielder {
  constructor(x, y) {
    this.baseX = x;
    this.baseY = y;
    this.x = x;
    this.y = y;
    this.speed = 3 + Math.random() * 2;
    this.radius = 15;
    this.hasBall = false;
  }

  update(ball) {
    if (!ball || !ball.active || !ball.isHit) {
      // Return to base position
      const dx = this.baseX - this.x;
      const dy = this.baseY - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        this.x += (dx / dist) * this.speed * 0.5;
        this.y += (dy / dist) * this.speed * 0.5;
      }
      this.hasBall = false;
      return;
    }

    if (this.hasBall) return;

    // Move towards ball if it's hit and within range
    const dx = ball.x - this.x;
    const dy = ball.y - this.y;
    const dist = Math.hypot(dx, dy);

    this.x += (dx / dist) * this.speed;
    this.y += (dy / dist) * this.speed;
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = "#0f3460"; // Jersey color
    ctx.fillRect(this.x - 12, this.y - 20, 24, 35);
    ctx.beginPath();
    ctx.arc(this.x, this.y - 25, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#fdbcb4";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.x, this.y - 28, 9, Math.PI, 0);
    ctx.fillStyle = "#0f3460";
    ctx.fill();
    ctx.restore();
  }
}

// ============================================
// INPUT HANDLER
// ============================================

class InputHandler {
  constructor(game) {
    this.game = game;
    this.keys = {};
    this.setupListeners();
  }

  setupListeners() {
    window.addEventListener("keydown", (e) => {
      this.keys[e.code] = true;
      this.handleKeyPress(e);
    });

    window.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
    });

    // Pause on Escape
    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape" && this.game.state.isPlaying) {
        this.game.togglePause();
      }
    });
  }

  handleKeyPress(e) {
    if (!this.game.state.isPlaying || this.game.state.isPaused) return;

    // Prevent default for game keys
    if (["Space", "KeyA", "KeyS", "KeyD"].includes(e.code)) {
      e.preventDefault();
    }

    // Get current ball
    const ball = this.game.state.currentBall;
    if (!ball || ball.isHit || ball.isOut) return;

    let shotType = null;
    let power = 0.5;
    let direction = 0;

    switch (e.code) {
      case "Space":
        shotType = "standard";
        power = 0.6;
        direction = 0;
        break;
      case "KeyA":
        shotType = "loft";
        power = 1.0;
        direction = -0.3;
        break;
      case "KeyS":
        shotType = "defensive";
        power = 0.3;
        direction = 0;
        break;
      case "KeyD":
        shotType = "drive";
        power = 0.8;
        direction = 0.2;
        break;
      default:
        return;
    }

    if (shotType) {
      this.game.attemptShot(shotType, power, direction);
    }
  }

  isKeyPressed(code) {
    return this.keys[code] || false;
  }
}

// ============================================
// UI MANAGER
// ============================================

class UIManager {
  constructor(game) {
    this.game = game;
    this.screens = {
      login: document.getElementById("login-screen"),
      start: document.getElementById("start-screen"),
      toss: document.getElementById("toss-screen"),
      roster: document.getElementById("roster-screen"),
      game: document.getElementById("game-screen"),
      gameOver: document.getElementById("game-over-screen"),
    };
    this.elements = {
      currentBatsman: document.getElementById("current-batsman"),
      score: document.getElementById("score"),
      balls: document.getElementById("balls"),
      strikeRate: document.getElementById("strike-rate"),
      highScore: document.getElementById("high-score"),
      timingMeter: document.querySelector(".indicator"),
      shotFeedback: document.getElementById("shot-feedback"),
      finalScore: document.getElementById("final-score"),
      finalBalls: document.getElementById("final-balls"),
      finalStrikeRate: document.getElementById("final-strike-rate"),
      finalHighScore: document.getElementById("final-high-score"),
      performanceComment: document.getElementById("performance-comment"),
      resultTitle: document.getElementById("result-title"),
    };
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Login & OTP Logic
    const phoneInput = document.getElementById("phone-input");
    const otpInput = document.getElementById("otp-input");
    const phoneSection = document.getElementById("phone-section");
    const otpSection = document.getElementById("otp-section");
    let generatedOtp = null;

    document.getElementById("btn-send-otp").addEventListener("click", () => {
      const phone = phoneInput.value.trim();
      if (phone.length === 10 && /^\d+$/.test(phone)) {
        // Generate random 4-digit OTP
        generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();

        // Show realistic Mock SMS Notification
        const smsNotification = document.getElementById("sms-notification");
        document.getElementById("sms-otp-value").textContent = generatedOtp;
        smsNotification.classList.add("show");

        // Hide SMS after 5 seconds
        setTimeout(() => {
          smsNotification.classList.remove("show");
        }, 5000);

        document.getElementById("display-phone").textContent = phone;
        phoneSection.style.display = "none";
        otpSection.style.display = "block";
      } else {
        alert("Please enter a valid 10-digit phone number.");
      }
    });

    document.getElementById("btn-verify-otp").addEventListener("click", () => {
      const enteredOtp = otpInput.value.trim();
      if (enteredOtp === generatedOtp) {
        this.showScreen("start"); // Move to game setup
      } else {
        alert("Invalid OTP! Please try again.");
      }
    });

    document.getElementById("btn-back-phone").addEventListener("click", () => {
      otpSection.style.display = "none";
      phoneSection.style.display = "block";
    });

    // Mode selection
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".mode-btn")
          .forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        this.game.selectedMode = btn.dataset.mode;

        // Show/hide over selection
        const overSelection = document.getElementById("over-selection");
        const teamSelection = document.getElementById("team-selection");
        if (this.game.selectedMode === "match") {
          overSelection.style.display = "block";
          if (teamSelection) teamSelection.style.display = "block";

          // Auto-select defaults so PLAY NOW is active immediately
          if (!this.game.selectedOvers) {
            const btn = document.querySelector('.over-btn[data-overs="2"]');
            if (btn) btn.click();
          }
          if (!this.game.selectedPlayerTeam) {
            const btn = document.querySelector(
              '#player-teams .team-btn[data-team="CSK"]',
            );
            if (btn) btn.click();
          }
          if (!this.game.selectedOpponentTeam) {
            const btn = document.querySelector(
              '#opponent-teams .team-btn[data-team="MI"]',
            );
            if (btn) btn.click();
          }
          if (!this.game.selectedDifficulty) {
            const btn = document.querySelector('button[data-diff="medium"]');
            if (btn) btn.click();
          }
        } else {
          overSelection.style.display = "none";
          if (teamSelection) teamSelection.style.display = "none";
        }

        this.checkCanStart();
      });
    });

    // Team selection
    document.querySelectorAll("#player-teams .team-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll("#player-teams .team-btn")
          .forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        this.game.selectedPlayerTeam = btn.dataset.team;
        this.checkCanStart();
      });
    });
    document.querySelectorAll("#opponent-teams .team-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll("#opponent-teams .team-btn")
          .forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        this.game.selectedOpponentTeam = btn.dataset.team;
        this.checkCanStart();
      });
    });

    // Over selection
    document.querySelectorAll(".over-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".over-btn")
          .forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        this.game.selectedOvers = parseInt(btn.dataset.overs);
        this.checkCanStart();
      });
    });

    // Difficulty selection
    document.querySelectorAll("button[data-diff]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll("button[data-diff]")
          .forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        this.game.selectedDifficulty = btn.dataset.diff;
        this.checkCanStart();
      });
    });

    // Play button
    document.getElementById("play-btn").addEventListener("click", () => {
      let canStart = false;
      if (this.game.selectedMode === "practice") {
        canStart = !!this.game.selectedDifficulty;
      } else if (this.game.selectedMode === "match") {
        canStart = !!(
          this.game.selectedDifficulty &&
          this.game.selectedOvers &&
          this.game.selectedPlayerTeam &&
          this.game.selectedOpponentTeam
        );
      }
      if (canStart) {
        if (this.game.selectedMode === "match") {
          this.showTossScreen();
        } else {
          this.game.selectedBatsman = "Player";
          this.game.startGame();
        }
      }
    });

    // Toss logic
    const tossControls = document.getElementById("toss-controls");
    const tossResult = document.getElementById("toss-result");
    const coin = document.getElementById("coin");
    const btnContinueRoster = document.getElementById("btn-continue-roster");

    const doToss = (playerChoice) => {
      tossControls.style.display = "none";
      coin.classList.add("flipping");
      this.game.audio.playHit();

      setTimeout(() => {
        coin.classList.remove("flipping");
        const result = Math.random() < 0.5 ? "HEADS" : "TAILS";
        const wonToss = playerChoice === result;

        tossResult.style.display = "block";
        if (wonToss) {
          tossResult.textContent = `It's ${result}! You won the toss and elected to bat.`;
          tossResult.style.color = "var(--success-color)";
        } else {
          tossResult.textContent = `It's ${result}! Opponent won the toss and elected to bowl.`;
          tossResult.style.color = "var(--danger-color)";
        }
        btnContinueRoster.style.display = "inline-block";
      }, 2000);
    };

    document
      .getElementById("btn-heads")
      .addEventListener("click", () => doToss("HEADS"));
    document
      .getElementById("btn-tails")
      .addEventListener("click", () => doToss("TAILS"));

    btnContinueRoster.addEventListener("click", () => {
      this.showRosterScreen();
    });

    // Roster start match
    document.getElementById("btn-start-match").addEventListener("click", () => {
      this.game.startGame();
    });

    // Restart button
    document.getElementById("restart-btn").addEventListener("click", () => {
      this.game.restartGame();
    });

    // Menu button
    document.getElementById("menu-btn").addEventListener("click", () => {
      this.showScreen("start");
      this.game.reset();
    });

    // Resume button
    document.getElementById("resume-btn").addEventListener("click", () => {
      this.game.togglePause();
    });

    // Pause menu button
    document.getElementById("pause-menu-btn").addEventListener("click", () => {
      this.game.togglePause();
      this.showScreen("start");
      this.game.reset();
    });
  }

  checkCanStart() {
    const playBtn = document.getElementById("play-btn");
    let canStart = false;
    if (this.game.selectedMode === "practice") {
      canStart = !!this.game.selectedDifficulty;
    } else if (this.game.selectedMode === "match") {
      canStart = !!(
        this.game.selectedDifficulty &&
        this.game.selectedOvers &&
        this.game.selectedPlayerTeam &&
        this.game.selectedOpponentTeam
      );
    }
    playBtn.disabled = !canStart;
  }

  showScreen(screenName) {
    Object.values(this.screens).forEach((screen) => {
      screen.classList.remove("active");
    });
    this.screens[screenName].classList.add("active");
  }

  showTossScreen() {
    this.showScreen("toss");
    document.getElementById("toss-matchup").textContent =
      `${this.game.selectedPlayerTeam} vs ${this.game.selectedOpponentTeam}`;
    document.getElementById("toss-controls").style.display = "flex";
    document.getElementById("toss-result").style.display = "none";
    document.getElementById("btn-continue-roster").style.display = "none";
    document.getElementById("coin").classList.remove("flipping");
  }

  showRosterScreen() {
    this.showScreen("roster");
    const container = document.getElementById("roster-buttons");
    container.innerHTML = "";
    const squad = CONFIG.IPL_SQUADS[this.game.selectedPlayerTeam] || [
      "Player 1",
      "Player 2",
    ];

    const startBtn = document.getElementById("btn-start-match");
    startBtn.disabled = true;
    this.game.selectedBatsman = null;

    squad.forEach((player) => {
      const btn = document.createElement("button");
      btn.className = "team-btn";
      btn.textContent = player;
      btn.style.fontSize = "1rem";
      btn.style.padding = "12px 20px";
      btn.addEventListener("click", () => {
        container
          .querySelectorAll(".team-btn")
          .forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        this.game.selectedBatsman = player;
        startBtn.disabled = false;
      });
      container.appendChild(btn);
    });
  }

  updateHUD() {
    if (this.game.state.gameMode === CONFIG.MODE_MATCH) {
      this.elements.score.textContent = `${this.game.state.score}/${this.game.state.wickets}`;
      const overs = Math.floor(this.game.state.ballsFaced / 6);
      const balls = this.game.state.ballsFaced % 6;
      this.elements.balls.textContent = `${overs}.${balls} / ${this.game.state.targetBalls / 6}.0`;

      const matchup = document.getElementById("matchup-display");
      if (matchup) {
        matchup.style.display = "block";
        matchup.textContent = `${this.game.selectedPlayerTeam} vs ${this.game.selectedOpponentTeam}`;
      }
    } else {
      this.elements.score.textContent = this.game.state.score;
      this.elements.balls.textContent = this.game.state.ballsFaced;
      const matchup = document.getElementById("matchup-display");
      if (matchup) matchup.style.display = "none";
    }
    if (this.elements.currentBatsman) {
      this.elements.currentBatsman.textContent =
        this.game.selectedBatsman || "Player";
    }
    this.elements.strikeRate.textContent = this.game.state.strikeRate;
    this.elements.highScore.textContent = this.game.state.highScore;
  }

  updateTimingMeter(ball, batsmanY) {
    if (!ball || ball.isHit) {
      this.elements.timingMeter.style.left = "0%";
      return;
    }

    // Calculate timing meter position based on ball distance to batsman
    const distance = Math.abs(ball.y - batsmanY);
    const maxDistance = 300;
    const progress = Math.max(0, Math.min(1, 1 - distance / maxDistance));

    this.elements.timingMeter.style.left = `${progress * 100}%`;
  }

  showShotFeedback(text, type) {
    const feedback = this.elements.shotFeedback;
    feedback.textContent = text;
    feedback.className = `shot-feedback ${type} show`;

    setTimeout(() => {
      feedback.classList.remove("show");
    }, 1000);
  }

  showGameOver(isOut) {
    this.elements.finalScore.textContent = this.game.state.score;
    this.elements.finalBalls.textContent = this.game.state.ballsFaced;
    this.elements.finalStrikeRate.textContent = this.game.state.strikeRate;
    this.elements.finalHighScore.textContent = this.game.state.highScore;

    // Performance comment
    let comment = "";
    const score = this.game.state.score;
    const wickets = this.game.state.wickets;
    const balls = this.game.state.ballsFaced;
    const strikeRate = parseFloat(this.game.state.strikeRate);

    if (wickets >= 10) {
      this.elements.resultTitle.textContent = "ALL OUT!";
      this.elements.resultTitle.style.color = "var(--danger-color)";
      comment = "Innings over! You lost all 10 wickets.";
    } else if (balls >= this.game.state.targetBalls) {
      this.elements.resultTitle.textContent = "INNINGS OVER";
      this.elements.resultTitle.style.color = "var(--warning-color)";
      comment = "Target overs completed! Well played.";
    } else if (score >= 50) {
      this.elements.resultTitle.textContent = "CENTURY!";
      this.elements.resultTitle.style.color = "var(--accent-color)";
      comment = "Outstanding batting! You are a true master!";
    } else if (score >= 30) {
      this.elements.resultTitle.textContent = "GREAT INNINGS!";
      this.elements.resultTitle.style.color = "var(--success-color)";
      comment = "Excellent performance! Well played!";
    } else if (strikeRate > 150) {
      this.elements.resultTitle.textContent = "GOOD BATTING!";
      this.elements.resultTitle.style.color = "var(--warning-color)";
      comment = "Great strike rate! Keep it up!";
    } else {
      this.elements.resultTitle.textContent = "MATCH OVER!";
      this.elements.resultTitle.style.color = "#17a2b8";
      comment = "Good effort! Practice makes perfect.";
    }

    this.elements.performanceComment.textContent = comment;
    this.showScreen("gameOver");
  }

  togglePauseOverlay(show) {
    const overlay = document.getElementById("pause-overlay");
    if (show) {
      overlay.classList.add("active");
    } else {
      overlay.classList.remove("active");
    }
  }
}

// ============================================
// MAIN GAME CLASS
// ============================================

class CricketGame {
  constructor() {
    this.state = new GameState();
    this.audio = new AudioManager();
    this.ui = new UIManager(this);
    this.input = new InputHandler(this);

    // Selection state
    this.selectedMode = null;
    this.selectedDifficulty = null;
    this.selectedOvers = null;
    this.selectedPlayerTeam = null;
    this.selectedOpponentTeam = null;
    this.selectedBatsman = null;

    // Canvas setup
    this.canvas = document.getElementById("game-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.resizeCanvas();

    this.fielders = [];
    this.setupFielders();

    // Game entities
    this.batsman = new Batsman(this.canvas.width / 2, this.canvas.height - 150);
    this.bowler = new Bowler(this.canvas.width / 2, 100);

    // Timing
    this.lastTime = 0;
    this.ballSpawnTimer = 0;
    this.ballSpawnInterval = 2000;

    // Bind methods
    this.gameLoop = this.gameLoop.bind(this);
    this.resizeCanvas = this.resizeCanvas.bind(this);

    // Resize listener
    window.addEventListener("resize", this.resizeCanvas);

    // Initialize UI
    this.ui.updateHUD();

    // Start loop
    requestAnimationFrame(this.gameLoop);
  }

  resizeCanvas() {
    const container = document.getElementById("game-container");
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;

    // Reposition entities
    if (this.batsman) {
      this.batsman.x = this.canvas.width / 2;
      this.batsman.y = this.canvas.height - 150;
    }
    if (this.bowler) {
      this.bowler.x = this.canvas.width / 2;
      this.bowler.y = 100;
    }

    this.setupFielders();
  }

  setupFielders() {
    this.fielders = [];
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const by = this.canvas.height - 150; // batsman y

    const positions = [
      { x: cx - 40, y: by + 60 }, // Keeper
      { x: cx - 250, y: cy + 50 }, // Point
      { x: cx - 180, y: cy - 100 }, // Cover
      { x: cx - 80, y: cy - 250 }, // Mid off
      { x: cx + 80, y: cy - 250 }, // Mid on
      { x: cx + 180, y: cy - 100 }, // Mid wicket
      { x: cx + 250, y: cy + 50 }, // Square leg
      { x: cx + 120, y: by + 80 }, // Fine leg
      { x: cx - 120, y: by + 80 }, // Third man
      { x: cx - 350, y: cy - 50 }, // Deep cover
      { x: cx + 350, y: cy - 50 }, // Deep mid wicket
    ];
    positions.forEach((p) => this.fielders.push(new Fielder(p.x, p.y)));
  }

  startGame() {
    // Resume audio context on user interaction
    if (
      this.audio.audioContext &&
      this.audio.audioContext.state === "suspended"
    ) {
      this.audio.audioContext.resume();
    }

    this.state.reset();
    this.state.gameMode = this.selectedMode;
    this.state.difficulty = this.selectedDifficulty;
    this.state.targetBalls =
      this.selectedMode === CONFIG.MODE_MATCH
        ? this.selectedOvers * CONFIG.BALLS_PER_OVER
        : Infinity;
    this.state.isPlaying = true;

    // Set spawn interval based on difficulty
    const diff = CONFIG.DIFFICULTY[this.selectedDifficulty];
    this.ballSpawnInterval = 2000 - diff.ballSpeed * 100;

    this.ui.showScreen("game");
    this.ui.updateHUD();
    this.spawnBall();
  }

  restartGame() {
    this.startGame();
  }

  reset() {
    this.state.reset();
    this.state.balls = [];
    this.state.particles = [];
    this.state.currentBall = null;
    this.ui.updateHUD();
  }

  togglePause() {
    this.state.isPaused = !this.state.isPaused;
    this.ui.togglePauseOverlay(this.state.isPaused);
  }

  spawnBall() {
    if (!this.state.isPlaying || this.state.isPaused) return;

    const x = this.canvas.width / 2 + (Math.random() - 0.5) * 40;
    const ball = new Ball(x, 120, this.state.difficulty);
    ball.perfectY = this.batsman.y;

    this.state.balls.push(ball);
    this.state.currentBall = ball;
  }

  attemptShot(shotType, power, direction) {
    const ball = this.state.currentBall;
    if (!ball || ball.isHit || ball.isOut) return;

    // Calculate timing
    const distance = Math.abs(ball.y - this.batsman.y);
    let timing = "miss";
    let runs = 0;

    if (distance <= CONFIG.TIMING.perfect) {
      timing = "perfect";
      const possibleRuns = CONFIG.RUNS.perfect;
      runs = possibleRuns[Math.floor(Math.random() * possibleRuns.length)];
    } else if (distance <= CONFIG.TIMING.good) {
      timing = "good";
      const possibleRuns = CONFIG.RUNS.good;
      runs = possibleRuns[Math.floor(Math.random() * possibleRuns.length)];
    } else if (distance <= CONFIG.TIMING.late) {
      timing = "late";
      const possibleRuns = CONFIG.RUNS.late;
      runs = possibleRuns[Math.floor(Math.random() * possibleRuns.length)];
    }

    // Apply shot type modifier
    if (shotType === "loft" && timing === "perfect") {
      runs = 6;
    } else if (shotType === "defensive") {
      runs = Math.min(runs, 1);
    } else if (shotType === "drive" && timing === "perfect") {
      runs = Math.max(runs, 4);
    }

    // Execute shot
    if (runs > 0) {
      ball.hit(power, direction, timing);
      ball.runs = runs;
      this.state.score += runs;
      this.state.ballsFaced++;
      this.state.updateStrikeRate();

      // Create particles
      this.createHitParticles(ball.x, ball.y);

      // Audio feedback
      this.audio.playHit();
      if (runs >= 4) {
        setTimeout(() => this.audio.playCheer(), 200);
      }

      // Visual feedback
      let feedbackText = "";
      let feedbackClass = "";

      if (runs === 6) {
        feedbackText = "SIX!";
        feedbackClass = "six";
      } else if (runs === 4) {
        feedbackText = "FOUR!";
        feedbackClass = "four";
      } else if (runs === 2) {
        feedbackText = "2 RUNS";
        feedbackClass = "two";
      } else {
        feedbackText = "1 RUN";
        feedbackClass = "one";
      }

      this.ui.showShotFeedback(feedbackText, feedbackClass);
      this.ui.updateHUD();

      // Bat swing animation
      this.batsman.swing();

      // Schedule next ball
      if (this.nextBallTimeout) clearTimeout(this.nextBallTimeout);
      this.nextBallTimeout = setTimeout(() => this.nextBall(), 1500);
    } else {
      // Missed or edged
      if (Math.random() < 0.3) {
        // Edge chance
        ball.hit(power * 0.3, direction + 0.5, timing);
        this.state.ballsFaced++;
        this.ui.showShotFeedback("EDGED!", "miss");
        this.audio.playHit();
        if (this.nextBallTimeout) clearTimeout(this.nextBallTimeout);
        this.nextBallTimeout = setTimeout(() => this.nextBall(), 1500);
      } else {
        // Clean miss - ball continues
        this.ui.showShotFeedback("MISS!", "miss");
      }
    }
  }

  createHitParticles(x, y) {
    const colors = ["#ffd700", "#ffed4a", "#ffffff", "#ff6b6b"];
    for (let i = 0; i < 15; i++) {
      const angle = (Math.PI * 2 * i) / 15;
      const speed = 3 + Math.random() * 5;
      this.state.particles.push(
        new Particle(x, y, colors[Math.floor(Math.random() * colors.length)], {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        }),
      );
    }
  }

  nextBall() {
    if (this.state.isGameOver()) {
      this.endGame(false);
    } else {
      this.spawnBall();
    }
  }

  endGame(isOut) {
    this.state.isPlaying = false;
    this.state.saveHighScore();
    this.ui.showGameOver(isOut);
  }

  update(deltaTime) {
    if (!this.state.isPlaying || this.state.isPaused) return;

    // Update batsman
    this.batsman.update();

    // Update balls
    this.state.balls = this.state.balls.filter((ball) => {
      ball.update(this.batsman.y);

      // Check for miss/out
      if (ball.isOut && !ball.isHit) {
        if (this.state.gameMode === CONFIG.MODE_PRACTICE) {
          if (this.nextBallTimeout) clearTimeout(this.nextBallTimeout);
          this.nextBallTimeout = setTimeout(() => this.nextBall(), 1000);
        } else {
          // 30% chance of being OUT on a miss, otherwise it's a DOT BALL
          if (Math.random() < 0.3) {
            this.state.ballsFaced++;
            this.state.wickets++;
            this.state.updateStrikeRate();
            this.audio.playOut();
            this.ui.updateHUD();
            this.ui.showShotFeedback("OUT!", "out");

            if (this.state.isGameOver()) {
              if (this.nextBallTimeout) clearTimeout(this.nextBallTimeout);
              this.nextBallTimeout = setTimeout(() => this.endGame(true), 1500);
            } else {
              if (this.nextBallTimeout) clearTimeout(this.nextBallTimeout);
              this.nextBallTimeout = setTimeout(() => this.nextBall(), 1500);
            }
          } else {
            this.state.ballsFaced++;
            this.state.updateStrikeRate();
            this.ui.updateHUD();
            this.ui.showShotFeedback("DOT BALL", "miss");
            if (this.nextBallTimeout) clearTimeout(this.nextBallTimeout);
            this.nextBallTimeout = setTimeout(() => this.nextBall(), 1000);
          }
        }
      }

      return ball.active;
    });

    // Update particles
    this.state.particles = this.state.particles.filter((particle) => {
      particle.update();
      return particle.life > 0;
    });

    // Update fielders and check catching
    const ball = this.state.currentBall;
    let closestFielder = null;
    let minFielderDist = Infinity;

    if (ball && ball.active && ball.isHit) {
      this.fielders.forEach((fielder) => {
        const dist = Math.hypot(fielder.x - ball.x, fielder.y - ball.y);
        if (dist < minFielderDist) {
          minFielderDist = dist;
          closestFielder = fielder;
        }
      });
    }

    this.fielders.forEach((fielder) => {
      const isChasing = fielder === closestFielder;
      fielder.update(isChasing ? ball : null);

      if (ball && ball.active && ball.isHit && !fielder.hasBall) {
        const dist = Math.hypot(fielder.x - ball.x, fielder.y - ball.y);
        if (dist < fielder.radius + ball.radius) {
          if (!ball.hasBounced) {
            // Caught Out!
            ball.active = false;
            fielder.hasBall = true;
            this.handleCaughtOut(ball);
          } else {
            // Stopped on ground
            ball.vx = 0;
            ball.vy = 0;
            ball.active = false;
            fielder.hasBall = true;
            this.ui.showShotFeedback("FIELDED", "two");
          }
        }
      }
    });

    // Update timing meter
    this.ui.updateTimingMeter(this.state.currentBall, this.batsman.y);
  }

  handleCaughtOut(ball) {
    if (ball.runs) {
      this.state.score -= ball.runs;
    }
    this.state.wickets++;
    this.state.updateStrikeRate();
    this.audio.playOut();
    this.ui.updateHUD();
    this.ui.showShotFeedback("CAUGHT!", "out");
    if (this.nextBallTimeout) clearTimeout(this.nextBallTimeout);
    if (this.state.isGameOver()) {
      this.nextBallTimeout = setTimeout(() => this.endGame(true), 1500);
    } else {
      this.nextBallTimeout = setTimeout(() => this.nextBall(), 1500);
    }
  }

  draw() {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw pitch markings
    this.drawPitch();

    // Draw stumps
    this.drawStumps();

    // Draw bowler
    this.bowler.draw(this.ctx, this.state.isPlaying);

    // Draw fielders
    this.fielders.forEach((f) => f.draw(this.ctx));

    // Draw batsman
    this.batsman.draw(this.ctx);

    // Draw balls
    this.state.balls.forEach((ball) => ball.draw(this.ctx));

    // Draw particles
    this.state.particles.forEach((particle) => particle.draw(this.ctx));
  }

  drawPitch() {
    const ctx = this.ctx;
    const centerX = this.canvas.width / 2;

    // Real Cricket Pitch with Perspective
    ctx.save();
    ctx.fillStyle = "rgba(222, 184, 135, 0.85)"; // Realistic Pitch Color
    ctx.beginPath();
    ctx.moveTo(centerX - 50, 0); // Top Left
    ctx.lineTo(centerX + 50, 0); // Top Right
    ctx.lineTo(centerX + 110, this.canvas.height); // Bottom Right
    ctx.lineTo(centerX - 110, this.canvas.height); // Bottom Left
    ctx.fill();

    // White Crease Lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 3;

    const stumpY = this.batsman.y + 40;
    const poppingY = stumpY - 80;

    // Bowling Crease (Stump Line)
    ctx.beginPath();
    ctx.moveTo(centerX - 95, stumpY);
    ctx.lineTo(centerX + 95, stumpY);
    ctx.stroke();

    // Popping Crease (Batting Line)
    ctx.beginPath();
    ctx.moveTo(centerX - 105, poppingY);
    ctx.lineTo(centerX + 105, poppingY);
    ctx.stroke();

    // Return Creases (Side Lines)
    ctx.beginPath();
    ctx.moveTo(centerX - 95, stumpY + 20);
    ctx.lineTo(centerX - 85, poppingY - 30);
    ctx.moveTo(centerX + 95, stumpY + 20);
    ctx.lineTo(centerX + 85, poppingY - 30);
    ctx.stroke();

    // Bowler side creases (Top)
    const topStumpY = 100;
    const topPoppingY = topStumpY + 60;

    ctx.beginPath();
    ctx.moveTo(centerX - 60, topStumpY);
    ctx.lineTo(centerX + 60, topStumpY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX - 65, topPoppingY);
    ctx.lineTo(centerX + 65, topPoppingY);
    ctx.stroke();

    ctx.restore();
  }

  drawStumps() {
    const ctx = this.ctx;
    const centerX = this.canvas.width / 2;
    const stumpY = this.batsman.y + 40;

    ctx.save();
    ctx.fillStyle = "#f5f5dc";
    ctx.strokeStyle = "#d4af37";
    ctx.lineWidth = 2;

    // Three stumps
    for (let i = -1; i <= 1; i++) {
      const x = centerX + i * 8;
      ctx.fillRect(x - 2, stumpY, 4, 35);
      ctx.strokeRect(x - 2, stumpY, 4, 35);
    }

    // Bails
    ctx.fillRect(centerX - 10, stumpY - 3, 8, 3);
    ctx.fillRect(centerX + 2, stumpY - 3, 8, 3);

    ctx.restore();
  }

  gameLoop(currentTime) {
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    this.update(deltaTime);
    this.draw();

    requestAnimationFrame(this.gameLoop);
  }
}

// ============================================
// INITIALIZE GAME
// ============================================

// Start the game when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.game = new CricketGame();
  console.log("🏏 Cricket Batting Master loaded!");
  console.log("Controls: SPACE (Hit), A (Loft), S (Defensive), D (Drive)");
});

// State Management
let currentSlide = 1;
const totalSlides = 4;

let webcamActive = false;
let cameraInstance = null;
let handsInstance = null;
let userLandmarks = null;

// Animation and Simulation States
const simState = {
  // Slide 1
  slide1: {
    pinched: false,
    pinchX: 360,
    pinchY: 260,
    shakeIntensity: 0,
    isFaulting: false,
    monolithAngle: 0,
    sparks: [],
    handSimProgress: 0,
    simulating: false,
    masterSwitchOn: false,  // Master switch state - default OFF (dark)
    bulbsOn: false,  // All three bulbs controlled by master switch
    fingerAtSwitch: false  // Track if finger is at switch (for edge detection)
  },
  // Slide 2 - Now similar to Slide 1 but with cutting capability
  slide2: {
    pinched: false,
    pinchX: 360,
    pinchY: 260,
    shakeIntensity: 0,
    isFaulting: false,
    monolithAngle: 0,
    sparks: [],
    handSimProgress: 0,
    simulating: false,
    // Severing states
    cuttingState: {
      abCut: false,    // Workflow A to B line cut
      bcCut: false,    // Workflow B to C line cut
      cutParticles: []
    }
  },
  // Slide 3 - Shows final severed result
  slide3: {
    activeNode: null, // null = all off (default dark)
    pulsePackets: [],
    ambientPulse: 0,
    indexTapProgress: 0,
    simulatingTap: false,
    simulatingPalm: false,
    hoveredNode: null,
    activeNodes: [] // Array to track multiple nodes
  },
  // Slide 4 - Rasengan on palm
  slide4: {
    palmOpen: false,
    rasenganIntensity: 0,
    palmCenterX: 600,
    palmCenterY: 330
  }
};

// DOM References
const prevBtn = document.getElementById('prevSlideBtn');
const nextBtn = document.getElementById('nextSlideBtn');
const currentSlideNum = document.getElementById('currentSlideNum');
const totalSlidesNum = document.getElementById('totalSlidesNum');
const timelineSteps = document.querySelectorAll('.timeline-step');
const toggleWebcamBtn = document.getElementById('toggleWebcamBtn');
const webcamStatusText = document.getElementById('webcamStatusText');
const imageModal = document.getElementById('imageModal');
const modalImg = document.getElementById('modalImg');

// Standard MediaPipe 21 Connections
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // Index
  [5, 9], [9, 10], [10, 11], [11, 12], // Middle
  [9, 13], [13, 14], [14, 15], [15, 16], // Ring
  [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
  [0, 17] // Palm Base
];

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupCanvases();
  setupMediaPipeControls();
  requestAnimationFrame(renderLoop);
});

// Navigation Handling
function setupNavigation() {
  prevBtn.addEventListener('click', () => goToSlide(currentSlide - 1));
  nextBtn.addEventListener('click', () => goToSlide(currentSlide + 1));

  timelineSteps.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = parseInt(btn.getAttribute('data-goto'));
      goToSlide(target);
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
      if (currentSlide < totalSlides) goToSlide(currentSlide + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      if (currentSlide > 1) goToSlide(currentSlide - 1);
    }
  });
}

function goToSlide(slideNum) {
  if (slideNum < 1 || slideNum > totalSlides) return;
  currentSlide = slideNum;
  currentSlideNum.textContent = currentSlide;

  // Toggle slide visibility
  document.querySelectorAll('.slide-pane').forEach(pane => {
    pane.classList.toggle('active', parseInt(pane.getAttribute('data-slide')) === currentSlide);
  });

  // Update timeline
  timelineSteps.forEach(btn => {
    const stepNum = parseInt(btn.getAttribute('data-goto'));
    btn.classList.toggle('active', stepNum === currentSlide);
  });

  prevBtn.disabled = currentSlide === 1;
  nextBtn.disabled = currentSlide === totalSlides;
  nextBtn.innerHTML = currentSlide === totalSlides ? '<span>Completed</span>' : '<span>Next Slide</span> <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
}

// Modal inspection
function openAssetModal(src) {
  modalImg.src = src;
  imageModal.classList.add('open');
}
function closeAssetModal() {
  imageModal.classList.remove('open');
}

// Canvas Setup & Resize
let cvs1, ctx1, cvs2, ctx2, cvs3, ctx3, cvs4, ctx4;

function setupCanvases() {
  cvs1 = document.getElementById('canvas-slide-1');
  ctx1 = cvs1.getContext('2d');

  cvs2 = document.getElementById('canvas-slide-2');
  ctx2 = cvs2.getContext('2d');

  cvs3 = document.getElementById('canvas-slide-3');
  ctx3 = cvs3.getContext('2d');

  cvs4 = document.getElementById('canvas-slide-4');
  ctx4 = cvs4.getContext('2d');

  // Mouse interactivity on Canvas 1 for master switch (at 600, 510)
  cvs1.addEventListener('click', (e) => {
    const rect = cvs1.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * cvs1.width;
    const y = ((e.clientY - rect.top) / rect.height) * cvs1.height;
    
    // Check click on Master Switch (600, 510) - clickable area radius ~65
    if (Math.hypot(x - 600, y - 510) < 70) {
      simState.slide1.masterSwitchOn = !simState.slide1.masterSwitchOn;
      simState.slide1.bulbsOn = simState.slide1.masterSwitchOn;
      if (simState.slide1.masterSwitchOn) {
        document.getElementById('slide1GestureDetected').textContent = "Master Switch: ON ✓ (All bulbs lit up!)";
      } else {
        document.getElementById('slide1GestureDetected').textContent = "Master Switch: OFF (All bulbs dark)";
      }
    }
  });

  // Mouse interactivity on Canvas 3 for direct click tap (scaled for 1200x660)
  cvs3.addEventListener('click', (e) => {
    const rect = cvs3.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * cvs3.width;
    const y = ((e.clientY - rect.top) / rect.height) * cvs3.height;
    
    // Check click on Workflow A (340, 240), B (600, 170), C (860, 240), Central Hub (600, 510)
    if (Math.hypot(x - 340, y - 240) < 80) triggerTargetPulse('A');
    else if (Math.hypot(x - 600, y - 170) < 80) triggerTargetPulse('B');
    else if (Math.hypot(x - 860, y - 240) < 80) triggerTargetPulse('C');
    else if (Math.hypot(x - 600, y - 510) < 80) triggerTargetPulse('ALL');
  });
}

// MediaPipe Setup & Camera Control
function setupMediaPipeControls() {
  toggleWebcamBtn.addEventListener('click', () => {
    if (!webcamActive) {
      startMediaPipeWebcam();
    } else {
      stopMediaPipeWebcam();
    }
  });
}

async function startMediaPipeWebcam() {
  try {
    webcamStatusText.textContent = "Initializing AR Model...";
    const videoElement = document.getElementById('webcamVideo');

    if (typeof Hands === 'undefined') {
      alert("MediaPipe Hands library is loading from CDN. Please check your internet connection.");
      return;
    }

    handsInstance = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    handsInstance.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    handsInstance.onResults(onMediaPipeResults);

    cameraInstance = new Camera(videoElement, {
      onFrame: async () => {
        await handsInstance.send({ image: videoElement });
      },
      width: 640,
      height: 480
    });

    await cameraInstance.start();
    webcamActive = true;
    toggleWebcamBtn.classList.add('active');
    webcamStatusText.textContent = "AR Camera: Active (Live Tracking)";
  } catch (err) {
    console.error("Camera access error:", err);
    webcamStatusText.textContent = "Camera Denied / Fallback Mode";
    alert("Camera access was not granted or not available. Using interactive Gesture Simulation mode.");
  }
}

function stopMediaPipeWebcam() {
  if (cameraInstance) {
    cameraInstance.stop();
  }
  webcamActive = false;
  userLandmarks = null;
  toggleWebcamBtn.classList.remove('active');
  webcamStatusText.textContent = "AR Camera: Off (Simulation Mode)";
}

function onMediaPipeResults(results) {
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    userLandmarks = results.multiHandLandmarks;
    processLiveGestures(userLandmarks);
  } else {
    userLandmarks = null;
  }
}

// Process Real Hand Gestures
function processLiveGestures(multiHands) {
  if (!multiHands || multiHands.length === 0) return;
  const hand1 = multiHands[0];
  
  // Normalized points (0 to 1) -> Map to Canvas Dimensions (1200x660)
  const wrist = hand1[0];
  const thumbTip = hand1[4];
  const indexTip = hand1[8];
  const middleTip = hand1[12];
  const ringTip = hand1[16];
  
  // Calculate distance between thumb tip and index tip (pinch)
  const pinchDist = Math.hypot((1 - thumbTip.x) - (1 - indexTip.x), thumbTip.y - indexTip.y);

  if (currentSlide === 1) {
    // Convert index tip to canvas coordinates
    const indexX = (1 - indexTip.x) * 1200;
    const indexY = indexTip.y * 660;
    
    // Check if index finger is pointing at master switch (600, 510)
    const distToSwitch = Math.hypot(indexX - 600, indexY - 510);
    const isNowAtSwitch = distToSwitch < 80;  // Zone to trigger toggle
    
    // Edge detection: only toggle when transitioning INTO the switch zone
    if (isNowAtSwitch && !simState.slide1.fingerAtSwitch) {
      // Finger just entered switch zone - toggle once
      simState.slide1.masterSwitchOn = !simState.slide1.masterSwitchOn;
      simState.slide1.bulbsOn = simState.slide1.masterSwitchOn;
      if (simState.slide1.masterSwitchOn) {
        document.getElementById('slide1GestureDetected').textContent = "AR Gesture: Master Switch ON ✓ (All bulbs lit!)";
      } else {
        document.getElementById('slide1GestureDetected').textContent = "AR Gesture: Master Switch OFF (All bulbs dark)";
      }
    }
    
    // Update state for next frame
    simState.slide1.fingerAtSwitch = isNowAtSwitch;
    
    if (isNowAtSwitch) {
      document.getElementById('slide1GestureDetected').textContent = "AR Gesture: Finger at Master Switch (Move away to reset)";
    } else if (pinchDist < 0.08) {
      // Pinch gesture - but only cause damage if bulbs are ON
      if (simState.slide1.bulbsOn) {
        // Pick a random bulb to catch fire
        const bulbs = [
          { x: 340, y: 260, name: 'A' },
          { x: 600, y: 190, name: 'B' },
          { x: 860, y: 260, name: 'C' }
        ];
        const randomBulb = bulbs[Math.floor(Math.random() * bulbs.length)];
        document.getElementById('slide1GestureDetected').textContent = `AR Gesture: Pinch Detected! (Workflow ${randomBulb.name} Bulb on fire!)`;
        simState.slide1.shakeIntensity = Math.min(simState.slide1.shakeIntensity + 1.2, 22);
        simState.slide1.isFaulting = true;
        spawnSparks(randomBulb.x, randomBulb.y, 3);
      } else {
        document.getElementById('slide1GestureDetected').textContent = "AR Gesture: Pinch Detected (Bulbs are off - no damage)";
      }
    } else {
      document.getElementById('slide1GestureDetected').textContent = "AR Gesture: Hand Detected (Ready to Pinch or tap Master Switch)";
    }
  } else if (currentSlide === 2) {
    // Scissor gesture detection: Two fingers (index and middle) in scissor-like motion
    const indexX = (1 - indexTip.x) * 1200;
    const indexY = indexTip.y * 660;
    const middleX = (1 - middleTip.x) * 1200;
    const middleY = middleTip.y * 660;
    
    // Check if fingers are in scissor position (close together)
    const scissorDist = Math.hypot(indexX - middleX, indexY - middleY);
    
    if (scissorDist < 60) {
      // Detected scissor gesture - cut the appropriate line based on finger position
      const fingerMidX = (indexX + middleX) / 2;
      const fingerMidY = (indexY + middleY) / 2;
      
      // A-B line center is around (460, 205)
      if (Math.hypot(fingerMidX - 460, fingerMidY - 205) < 120 && !simState.slide2.cuttingState.abCut) {
        simState.slide2.cuttingState.abCut = true;
        spawnSeverParticles(460, 205, 30);
        document.getElementById('slide2GestureDetected').textContent = "AR Gesture: Scissor Cut Detected! (Workflow A ↔ B Line Cut!)";
      }
      // B-C line center is around (730, 205)
      else if (Math.hypot(fingerMidX - 730, fingerMidY - 205) < 120 && !simState.slide2.cuttingState.bcCut) {
        simState.slide2.cuttingState.bcCut = true;
        spawnSeverParticles(730, 205, 30);
        document.getElementById('slide2GestureDetected').textContent = "AR Gesture: Scissor Cut Detected! (Workflow B ↔ C Line Cut!)";
      }
    } else {
      document.getElementById('slide2GestureDetected').textContent = "AR Gesture: Ready to Scissor Cut";
    }
  } else if (currentSlide === 3) {
    // All finger tips can touch the lines to activate workflows
    simState.slide3.activeNodes = [];
    
    const workflows = [
      { x: 340, y: 240, id: 'A' },   // Workflow A
      { x: 600, y: 170, id: 'B' },   // Workflow B
      { x: 860, y: 240, id: 'C' }    // Workflow C
    ];
    const hubX = 600, hubY = 510;    // Hub position

    // Helper function to calculate distance from point to line segment
    function distanceToLineSegment(px, py, x1, y1, x2, y2) {
      const A = px - x1;
      const B = py - y1;
      const C = x2 - x1;
      const D = y2 - y1;

      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = -1;
      
      if (lenSq !== 0) param = dot / lenSq;

      let xx, yy;

      if (param < 0) {
        xx = x1;
        yy = y1;
      } else if (param > 1) {
        xx = x2;
        yy = y2;
      } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
      }

      const dx = px - xx;
      const dy = py - yy;
      return Math.sqrt(dx * dx + dy * dy);
    }

    // Check all hand landmarks (all finger tips)
    for (let handIdx = 0; handIdx < multiHands.length; handIdx++) {
      const hand = multiHands[handIdx];
      
      // Check all fingertips: 4, 8, 12, 16, 20 (Thumb, Index, Middle, Ring, Pinky)
      const fingerTips = [4, 8, 12, 16, 20];
      
      for (const tipIdx of fingerTips) {
        const tip = hand[tipIdx];
        const fingerX = (1 - tip.x) * 1200;
        const fingerY = tip.y * 660;
        
        // Check distance to each workflow line (hub to workflow)
        for (const wf of workflows) {
          // Calculate distance from finger to the line between hub and workflow
          const distToLine = distanceToLineSegment(fingerX, fingerY, hubX, hubY, wf.x, wf.y);
          
          // If finger is close to any part of the line, activate it
          if (distToLine < 30) {  // Reduced to 30px threshold
            if (!simState.slide3.activeNodes.includes(wf.id)) {
              simState.slide3.activeNodes.push(wf.id);
            }
          }
        }
      }
    }

    // Update display message
    if (simState.slide3.activeNodes.length > 0) {
      document.getElementById('slide3GestureDetected').textContent = `AR Gesture: Workflows ${simState.slide3.activeNodes.join(', ')} Activated`;
    } else {
      document.getElementById('slide3GestureDetected').textContent = `AR Gesture: Ready - touch any line with your fingers`;
    }
  } else if (currentSlide === 4) {
    // Palm detection - check if palm is open and facing up
    // Palm openness is determined by checking if fingers are spread
    const wrist = hand1[0];
    
    // Calculate palm center - use middle point between wrist and middle finger
    const middleFingerMCP = hand1[9];  // Middle finger MCP (knuckle)
    // MediaPipe: x is 0 on left, 1 on right. y is 0 on top, 1 on bottom
    // We need to flip x axis: (1 - x) to get canvas coordinates where right = higher value
    const palmCenterX = (1 - (wrist.x + middleFingerMCP.x) / 2) * 1200;  // Convert to canvas coords (0-1 -> 0-1200)
    const palmCenterY = ((wrist.y + middleFingerMCP.y) / 2) * 660;  // Convert to canvas coords (0-1 -> 0-660)
    
    // Calculate palm openness - if fingers are spread and palm facing camera
    const fingerTips = [4, 8, 12, 16, 20];
    let avgFingerZ = 0;
    for (const tipIdx of fingerTips) {
      avgFingerZ += hand1[tipIdx].z;
    }
    avgFingerZ /= 5;
    
    // Palm is open if fingers are spread and wrist z is lower (toward camera)
    const palmOpenness = Math.max(0, (wrist.z - avgFingerZ) * 10);
    const isPalmOpen = palmOpenness > 0.5;
    
    // Store palm center for rendering (already in canvas coordinates)
    simState.slide4.palmCenterX = palmCenterX;
    simState.slide4.palmCenterY = palmCenterY;
    
    simState.slide4.palmOpen = isPalmOpen;
    simState.slide4.rasenganIntensity = isPalmOpen ? Math.min(1.0, simState.slide4.rasenganIntensity + 0.1) : Math.max(0, simState.slide4.rasenganIntensity - 0.1);
    
    if (isPalmOpen) {
      document.getElementById('slide4GestureDetected').textContent = "AR Gesture: Palm Open - Rasengan Forming! ⚡";
    } else {
      document.getElementById('slide4GestureDetected').textContent = "AR Gesture: Close your palm or open it to form Rasengan";
    }
  }
}

// Gesture Simulators
function simulateGesture(type) {
  if (type === 'pinchShake') {
    simState.slide1.simulating = true;
    simState.slide1.handSimProgress = 0;
    simState.slide1.shakeIntensity = 22;
    simState.slide1.isFaulting = true;
    spawnSparks(340, 260, 30);
    document.getElementById('slide1GestureDetected').textContent = "Simulating: Pinch & Shake (Domino Ripple Triggered!)";
    setTimeout(() => {
      simState.slide1.simulating = false;
      document.getElementById('slide1GestureDetected').textContent = "AR Gesture: Ready (Pinch to Grab)";
    }, 3500);
  } 
  else if (type === 'sliceCut') {
    // Cut Workflow A to B line
    simState.slide2.cuttingState.abCut = true;
    spawnSeverParticles(460, 205, 40);
    document.getElementById('slide2GestureDetected').textContent = "Simulating: Scissor Cut (Workflow A ↔ B Line Cut!)";
    setTimeout(() => {
      document.getElementById('slide2GestureDetected').textContent = "Ready to cut more lines (B ↔ C)";
    }, 1800);
  }
  else if (type === 'sliceCutBC') {
    // Cut Workflow B to C line
    simState.slide2.cuttingState.bcCut = true;
    spawnSeverParticles(730, 205, 40);
    document.getElementById('slide2GestureDetected').textContent = "Simulating: Scissor Cut (Workflow B ↔ C Line Cut!)";
    setTimeout(() => {
      document.getElementById('slide2GestureDetected').textContent = "All dependencies severed!";
    }, 1800);
  }
  else if (type === 'resetSlide2') {
    simState.slide2.cuttingState.abCut = false;
    simState.slide2.cuttingState.bcCut = false;
    simState.slide2.cuttingState.cutParticles = [];
    simState.slide2.sparks = [];
    document.getElementById('slide2GestureDetected').textContent = "AR Gesture: Reset to Original State";
  }
  else if (type === 'tapWorkflowA') {
    triggerTargetPulse('A');
  }
  else if (type === 'tapWorkflowB') {
    triggerTargetPulse('B');
  }
  else if (type === 'tapWorkflowC') {
    triggerTargetPulse('C');
  }
  else if (type === 'openPalmReveal') {
    triggerTargetPulse('ALL');
  }
}

function triggerTargetPulse(nodeId) {
  simState.slide3.activeNode = nodeId;
  simState.slide3.indexTapProgress = 1.0;
  
  if (nodeId === 'A') {
    createPulsePacket(340, 240, 600, 510, '#06b6d4');
    document.getElementById('slide3GestureDetected').textContent = "Index Tap: Workflow A Active ➔ Smart Hub Routing Cleanly";
  } else if (nodeId === 'B') {
    createPulsePacket(600, 170, 600, 510, '#06b6d4');
    document.getElementById('slide3GestureDetected').textContent = "Index Tap: Workflow B Active ➔ Hall Lights Only";
  } else if (nodeId === 'C') {
    createPulsePacket(860, 240, 600, 510, '#06b6d4');
    document.getElementById('slide3GestureDetected').textContent = "Index Tap: Workflow C Active ➔ Floodlight Only";
  } else if (nodeId === 'ALL') {
    createPulsePacket(340, 240, 600, 510, '#06b6d4');
    createPulsePacket(600, 170, 600, 510, '#06b6d4');
    createPulsePacket(860, 240, 600, 510, '#06b6d4');
    simState.slide3.ambientPulse = 1.0;
    document.getElementById('slide3GestureDetected').textContent = "Hub Tap: Broadcast Clean Telemetry from Smart Hub";
  }
}

function createPulsePacket(x1, y1, x2, y2, color) {
  simState.slide3.pulsePackets.push({
    x1, y1, x2, y2,
    progress: 0,
    speed: 0.035,
    color: color
  });
}

function spawnSparks(x, y, count) {
  for (let i = 0; i < count; i++) {
    simState.slide1.sparks.push({
      x: x + (Math.random() - 0.5) * 60,
      y: y + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 7,
      vy: (Math.random() - 0.5) * 7 - 2,
      life: 1.0,
      decay: 0.03 + Math.random() * 0.04,
      size: 3 + Math.random() * 3
    });
  }
}

function spawnSeverParticles(x, y, count) {
  for (let i = 0; i < count; i++) {
    simState.slide2.cuttingState.cutParticles.push({
      x: x + (Math.random() - 0.5) * 80,
      y: y + (Math.random() - 0.5) * 80,
      vx: (Math.random() - 0.5) * 9,
      vy: (Math.random() - 0.5) * 9,
      life: 1.0,
      decay: 0.02 + Math.random() * 0.03,
      color: Math.random() > 0.4 ? '#ff3366' : '#fbbf24',
      size: 3.5 + Math.random() * 4
    });
  }
}

// MAIN RENDER LOOP
function renderLoop() {
  if (currentSlide === 1) renderSlide1();
  else if (currentSlide === 2) renderSlide2();
  else if (currentSlide === 3) renderSlide3();
  else if (currentSlide === 4) renderSlide4();

  requestAnimationFrame(renderLoop);
}

// ----------------------------------------------------------------------
// SLIDE 1: The Legacy State (Tightly Coupled Monolith Circuit)
// ----------------------------------------------------------------------
function renderSlide1() {
  const w = cvs1.width;
  const h = cvs1.height;
  ctx1.clearRect(0, 0, w, h);

  // Background grid
  drawTechGrid(ctx1, w, h);

  // Damping shake
  simState.slide1.shakeIntensity *= 0.94;
  const shakeX = (Math.random() - 0.5) * simState.slide1.shakeIntensity;
  const shakeY = (Math.random() - 0.5) * simState.slide1.shakeIntensity;

  // Master Switch Coordinates
  const switchX = 600 + shakeX * 0.4;
  const switchY = 510 + shakeY * 0.4;

  // Bulb Nodes Coordinates
  const nodeA = { x: 340 + shakeX, y: 240 + shakeY, label: 'Workflow A (Desk Lamp)' };
  const nodeB = { x: 600 + shakeX * 0.7, y: 170 + shakeY * 0.7, label: 'Workflow B (Hallway Light)' };
  const nodeC = { x: 860 + shakeX * 0.5, y: 240 + shakeY * 0.5, label: 'Workflow C (Floodlight)' };

  // Draw Tangled Glowing Red Dependency Cords
  drawTangledRedCords(ctx1, switchX, switchY, nodeA, nodeB, nodeC, simState.slide1.shakeIntensity);

  // Draw Master Switch Node (Hexagonal) - show if it's on or off
  drawMasterSwitchHexagon(ctx1, switchX, switchY, simState.slide1.masterSwitchOn);

  // Draw Bulb Nodes - controlled by master switch state
  drawBulbNode(ctx1, nodeA.x, nodeA.y, 'Workflow A', 'Desk Lamp (Click Master Switch)', simState.slide1.bulbsOn, '#ff1a4d', simState.slide1.shakeIntensity > 3);
  drawBulbNode(ctx1, nodeB.x, nodeB.y, 'Workflow B', 'Hallway Light', simState.slide1.bulbsOn, '#ff5577', simState.slide1.shakeIntensity > 6);
  drawBulbNode(ctx1, nodeC.x, nodeC.y, 'Workflow C', 'Floodlight', simState.slide1.bulbsOn, '#ff5577', simState.slide1.shakeIntensity > 9);

  // Draw Red Motion Vectors & Hazard Tags if shaking
  if (simState.slide1.shakeIntensity > 2) {
    drawMotionVectors(ctx1, nodeA, nodeB, nodeC);
  }

  // Draw Sparks
  updateAndDrawSparks(ctx1, simState.slide1.sparks);

  // Render AR Hand Tracking Overlay
  if (userLandmarks && userLandmarks.length > 0) {
    drawMediaPipeHandOverlay(ctx1, userLandmarks[0], w, h, 'Pinch & Grab');
  } else {
    // Simulated AR Holographic Hand Pinching Workflow A
    drawSimulatedHandPinch(ctx1, nodeA.x + 35, nodeA.y + 45, simState.slide1.shakeIntensity > 2);
  }
}

function drawTangledRedCords(ctx, swX, swY, a, b, c, shake) {
  ctx.save();
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = '#06b6d4';
  ctx.shadowColor = '#0891b2';
  ctx.shadowBlur = 18 + shake * 2;

  // Master switch to A
  drawCurvedCable(ctx, swX, swY - 35, a.x, a.y + 45, swX - 120, swY - 30, a.x - 40, a.y + 100);
  // Master switch to B
  drawCurvedCable(ctx, swX, swY - 35, b.x, b.y + 45, swX + 40, swY - 140, b.x - 50, b.y + 110);
  // Master switch to C
  drawCurvedCable(ctx, swX, swY - 35, c.x, c.y + 45, swX + 120, swY - 30, c.x + 50, c.y + 100);

  // Cross-dependencies (The Legacy Spaghetti!)
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.88)';
  drawCurvedCable(ctx, a.x, a.y, b.x, b.y, a.x + 110, a.y - 50, b.x - 80, b.y + 50);
  drawCurvedCable(ctx, b.x, b.y, c.x, c.y, b.x + 80, b.y + 60, c.x - 80, c.y - 40);

  ctx.restore();
}

function drawTangledRedCordsWithCutting(ctx, swX, swY, a, b, c, shake, cuttingState) {
  ctx.save();
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = '#06b6d4';
  ctx.shadowColor = '#0891b2';
  ctx.shadowBlur = 18 + shake * 2;

  // Master switch to A
  drawCurvedCable(ctx, swX, swY - 35, a.x, a.y + 45, swX - 120, swY - 30, a.x - 40, a.y + 100);
  // Master switch to B
  drawCurvedCable(ctx, swX, swY - 35, b.x, b.y + 45, swX + 40, swY - 140, b.x - 50, b.y + 110);
  // Master switch to C
  drawCurvedCable(ctx, swX, swY - 35, c.x, c.y + 45, swX + 120, swY - 30, c.x + 50, c.y + 100);

  // Cross-dependencies (The Legacy Spaghetti!) - with cutting
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.88)';
  
  // A to B line (can be cut)
  if (!cuttingState.abCut) {
    drawCurvedCable(ctx, a.x, a.y, b.x, b.y, a.x + 110, a.y - 50, b.x - 80, b.y + 50);
  }
  
  // B to C line (can be cut)
  if (!cuttingState.bcCut) {
    drawCurvedCable(ctx, b.x, b.y, c.x, c.y, b.x + 80, b.y + 60, c.x - 80, c.y - 40);
  }

  ctx.restore();
}

function drawCurvedCable(ctx, x1, y1, x2, y2, cx1, cy1, cx2, cy2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  if (cx2 !== undefined) {
    ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x2, y2);
  } else {
    ctx.quadraticCurveTo(cx1, cy1, x2, y2);
  }
  ctx.stroke();
}

function drawMasterSwitchHexagon(ctx, x, y, isOn = false) {
  ctx.save();
  const time = Date.now() * 0.004;

  // Hexagonal Outer Shield (Same as Smart Hub)
  ctx.strokeStyle = isOn ? '#10b981' : '#e5e7eb';  // Green when ON, gray when OFF
  ctx.shadowColor = isOn ? '#059669' : '#d1d5db';
  ctx.shadowBlur = isOn ? 16 : 8;
  ctx.lineWidth = 3;

  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + time * 0.15;
    const hx = x + Math.cos(angle) * 65;
    const hy = y + Math.sin(angle) * 65;
    if (i === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  ctx.fillStyle = isOn ? 'rgba(16, 185, 129, 0.15)' : 'rgba(8, 24, 48, 0.92)';  // Green tint when ON
  ctx.fill();
  ctx.stroke();

  // Core Pulse Ring
  ctx.beginPath();
  ctx.arc(x, y, 30 + Math.sin(time * 2) * 4, 0, Math.PI * 2);
  ctx.fillStyle = isOn ? '#10b981' : '#374151';  // Green when ON
  ctx.shadowBlur = isOn ? 20 : 12;
  ctx.fill();

  // Icon / Text - Only "MASTER" centered vertically
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#f1f5f9';
  ctx.font = '800 14px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MASTER', x, y);

  ctx.restore();
}

function drawBulbNode(ctx, x, y, title, sub, isOn, glowColor, isGlitching) {
  ctx.save();
  const time = Date.now() * 0.006;
  const glitchOffset = isGlitching ? (Math.random() - 0.5) * 10 : 0;

  // Glow Aura
  if (isOn) {
    const rad = ctx.createRadialGradient(x, y, 10, x, y, 80);
    rad.addColorStop(0, '#ffffff');
    rad.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
    rad.addColorStop(1, 'transparent');
    ctx.fillStyle = rad;
    ctx.beginPath();
    ctx.arc(x, y, 80, 0, Math.PI * 2);
    ctx.fill();
  }

  // Socket
  ctx.fillStyle = '#334155';
  ctx.fillRect(x - 14 + glitchOffset, y + 20, 28, 22);
  ctx.strokeStyle = '#64748b';
  ctx.strokeRect(x - 14 + glitchOffset, y + 20, 28, 22);

  // Glass Bulb
  ctx.beginPath();
  ctx.arc(x + glitchOffset, y - 6, 32, 0, Math.PI * 2);
  ctx.fillStyle = isOn ? '#fffbeb' : '#1e293b';
  ctx.shadowColor = isOn ? '#d1d5db' : '#000000';
  ctx.shadowBlur = isOn ? 12 : 0;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#fcd34d';
  ctx.stroke();

  // Filament
  if (isOn) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 10);
    ctx.lineTo(x - 5, y - 14);
    ctx.lineTo(x + 5, y - 14);
    ctx.lineTo(x + 10, y + 10);
    ctx.stroke();
  }

  // Node Badge / Label (更小的高度以容納單行文本)
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = 1.8;
  ctx.roundRect(x - 85, y - 58, 170, 24, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 13px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, x, y - 46);

  ctx.restore();
}

function drawMotionVectors(ctx, a, b, c) {
  ctx.save();
  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);

  [a, b, c].forEach(node => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, 52, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#fee2e2';
    ctx.font = '800 10px JetBrains Mono, monospace';
    ctx.fillText('⚠ DESTABILIZED', node.x, node.y + 60);
  });
  ctx.restore();
}

function updateAndDrawSparks(ctx, sparks) {
  ctx.save();
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.x += s.vx;
    s.y += s.vy;
    s.vy += 0.15;
    s.life -= s.decay;

    if (s.life <= 0) {
      sparks.splice(i, 1);
      continue;
    }

    ctx.fillStyle = `rgba(255, 200, 50, ${s.life})`;
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size * s.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ----------------------------------------------------------------------
// SLIDE 2: The Refactoring Action (Decoupling & Isolation) - Copy of Slide 1 with Cutting
// ----------------------------------------------------------------------
function renderSlide2() {
  const w = cvs2.width;
  const h = cvs2.height;
  ctx2.clearRect(0, 0, w, h);

  // Background grid
  drawTechGrid(ctx2, w, h);

  // Damping shake
  simState.slide2.shakeIntensity *= 0.94;
  const shakeX = (Math.random() - 0.5) * simState.slide2.shakeIntensity;
  const shakeY = (Math.random() - 0.5) * simState.slide2.shakeIntensity;

  // Master Switch Coordinates
  const switchX = 600 + shakeX * 0.4;
  const switchY = 510 + shakeY * 0.4;

  // Bulb Nodes Coordinates
  const nodeA = { x: 340 + shakeX, y: 240 + shakeY, label: 'Workflow A (Desk Lamp)' };
  const nodeB = { x: 600 + shakeX * 0.7, y: 170 + shakeY * 0.7, label: 'Workflow B (Hallway Light)' };
  const nodeC = { x: 860 + shakeX * 0.5, y: 240 + shakeY * 0.5, label: 'Workflow C (Floodlight)' };

  // Draw Tangled Glowing Red Dependency Cords with cutting states
  drawTangledRedCordsWithCutting(ctx2, switchX, switchY, nodeA, nodeB, nodeC, simState.slide2.shakeIntensity, simState.slide2.cuttingState);

  // Draw Master Switch Node (Hexagonal)
  drawMasterSwitchHexagon(ctx2, switchX, switchY);

  // Draw Bulb Nodes
  drawBulbNode(ctx2, nodeA.x, nodeA.y, 'Workflow A', 'Desk Lamp (Scissor Target)', true, '#ff1a4d', simState.slide2.shakeIntensity > 3);
  drawBulbNode(ctx2, nodeB.x, nodeB.y, 'Workflow B', 'Hallway Light', true, '#ff5577', simState.slide2.shakeIntensity > 6);
  drawBulbNode(ctx2, nodeC.x, nodeC.y, 'Workflow C', 'Floodlight', true, '#ff5577', simState.slide2.shakeIntensity > 9);

  // Draw Red Motion Vectors & Hazard Tags if shaking
  if (simState.slide2.shakeIntensity > 2) {
    drawMotionVectors(ctx2, nodeA, nodeB, nodeC);
  }

  // Draw Sparks
  updateAndDrawSparks(ctx2, simState.slide2.sparks);
  
  // Draw Cutting Particles
  updateAndDrawSeverParticles(ctx2, simState.slide2.cuttingState.cutParticles);

  // Render AR Hand Tracking Overlay
  if (userLandmarks && userLandmarks.length > 0) {
    drawMediaPipeHandOverlay(ctx2, userLandmarks[0], w, h, 'Scissor to Cut');
  } else {
    // Simulated AR Holographic Hand Scissor
    drawSimulatedCuttingHand(ctx2, 340, 180);
  }
}

function updateAndDrawSeverParticles(ctx, particles) {
  ctx.save();
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.decay;

    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }

    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.globalAlpha = p.life;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ----------------------------------------------------------------------
// SLIDE 3: The Target Architecture (Centralized Orchestration)
// Shows the result after both cuts from Slide 2
// ----------------------------------------------------------------------
function renderSlide3() {
  const w = cvs3.width;
  const h = cvs3.height;
  ctx3.clearRect(0, 0, w, h);

  drawTechGrid(ctx3, w, h);

  // Damping shake (no shake for Slide 3)
  const shakeX = 0;
  const shakeY = 0;

  // Central Hub (Master Switch as Hexagon)
  const hub = { x: 600, y: 510, label: 'SMART HUB ORCHESTRATOR' };

  // Radial Workflow Nodes
  const nodeA = { x: 340, y: 240, label: 'Workflow A', sub: 'Dedicated Conduit', id: 'A' };
  const nodeB = { x: 600, y: 170, label: 'Workflow B', sub: 'Dedicated Conduit', id: 'B' };
  const nodeC = { x: 860, y: 240, label: 'Workflow C', sub: 'Dedicated Conduit', id: 'C' };

  // Draw only the master switch lines (no cross-dependencies) - representing final severed state
  drawFinalArchitectureLines(ctx3, hub, nodeA, nodeB, nodeC);

  // Draw Central Smart Hub Orchestrator (Hexagon)
  drawMasterSwitchHexagon(ctx3, hub.x, hub.y);

  // Update and draw live data packets
  updateAndDrawPulsePackets(ctx3);

  // Draw Nodes
  const isA_On = simState.slide3.activeNodes.includes('A');
  const isB_On = simState.slide3.activeNodes.includes('B');
  const isC_On = simState.slide3.activeNodes.includes('C');

  drawBulbNode(ctx3, nodeA.x, nodeA.y, nodeA.label, nodeA.sub, isA_On, '#ff1a4d', false);
  drawBulbNode(ctx3, nodeB.x, nodeB.y, nodeB.label, nodeB.sub, isB_On, '#ff5577', false);
  drawBulbNode(ctx3, nodeC.x, nodeC.y, nodeC.label, nodeC.sub, isC_On, '#ff5577', false);

  // Render Hand Overlay
  if (userLandmarks && userLandmarks.length > 0) {
    drawMediaPipeHandOverlay(ctx3, userLandmarks[0], w, h, 'Index Tap');
  } else {
    // Simulated MediaPipe Index Tap on Workflow A
    drawSimulatedIndexTap(ctx3, nodeA.x + 25, nodeA.y + 15, isA_On);
  }
}

function drawHubConduits(ctx, hub, node, isActive) {
  ctx.save();
  ctx.lineWidth = isActive ? 4 : 2;
  ctx.strokeStyle = isActive ? '#06b6d4' : 'rgba(6, 182, 212, 0.28)';
  ctx.shadowColor = '#06b6d4';
  ctx.shadowBlur = isActive ? 20 : 0;

  ctx.beginPath();
  ctx.moveTo(hub.x, hub.y);
  ctx.lineTo(node.x, node.y);
  ctx.stroke();

  // Draw data flow direction arrows
  const midX = (hub.x + node.x) / 2;
  const midY = (hub.y + node.y) / 2;
  ctx.fillStyle = isActive ? '#00f2fe' : '#64748b';
  ctx.beginPath();
  ctx.arc(midX, midY, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawFinalArchitectureLines(ctx, hub, nodeA, nodeB, nodeC) {
  ctx.save();
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = '#06b6d4';
  ctx.shadowColor = '#0891b2';
  ctx.shadowBlur = 16;

  // Only draw master switch to each node lines (no cross-dependencies)
  drawCurvedCable(ctx, hub.x, hub.y - 35, nodeA.x, nodeA.y + 45, hub.x - 120, hub.y - 30, nodeA.x - 40, nodeA.y + 100);
  drawCurvedCable(ctx, hub.x, hub.y - 35, nodeB.x, nodeB.y + 45, hub.x + 40, hub.y - 140, nodeB.x - 50, nodeB.y + 110);
  drawCurvedCable(ctx, hub.x, hub.y - 35, nodeC.x, nodeC.y + 45, hub.x + 120, hub.y - 30, nodeC.x + 50, nodeC.y + 100);

  ctx.restore();
}

function updateAndDrawPulsePackets(ctx) {
  // Disabled: No longer drawing pulse packets/beams
  // Light control is now based on finger position only
}

// ----------------------------------------------------------------------
// HELPER DRAWING FUNCTIONS (Grid, MediaPipe Landmarks & Skeletons)
// ----------------------------------------------------------------------

function drawTechGrid(ctx, w, h) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  const step = 48;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
}

// Render 21 MediaPipe Landmarks onto Canvas from real webcam
function drawMediaPipeHandOverlay(ctx, landmarks, w, h, label) {
  const pts = landmarks.map(lm => ({
    x: (1 - lm.x) * w,
    y: lm.y * h
  }));

  const pinchDist = Math.hypot(pts[4].x - pts[8].x, pts[4].y - pts[8].y);
  const isPinching = pinchDist < 40;
  const isTapping = currentSlide === 3;

  renderTronHandMinimal(ctx, pts, `LIVE: ${label}`, {
    isPinching,
    isTapping
  });
}

// TRON-Style Hand with Full Skeleton: Recognizable hand shape with glowing elements
function renderTronHandMinimal(ctx, pts, label = '', options = {}) {
  if (!pts || pts.length < 21) return;

  ctx.save();

  const p0 = pts[0]; // Wrist
  const p9 = pts[9]; // Middle MCP
  const palmDist = Math.hypot(p9.x - p0.x, p9.y - p0.y) || 120;
  const scale = Math.max(0.5, Math.min(2.2, palmDist / 120));

  const time = Date.now() * 0.003;

  // 1. Draw complete hand skeleton with reduced connections (25% fewer points)
  // Reduced: Keep key joints only - wrist, 2 joints per finger + fingertip
  const reducedConnections = [
    // Thumb (wrist -> 2nd joint -> tip)
    [0, 2], [2, 4],
    // Index
    [0, 6], [6, 8],
    // Middle
    [0, 10], [10, 12],
    // Ring
    [0, 14], [14, 16],
    // Pinky
    [0, 18], [18, 20]
    // Removed palm webbing to clean up appearance
  ];

  // Draw skeleton lines
  ctx.strokeStyle = 'rgba(0, 242, 254, 0.25)';
  ctx.lineWidth = 2 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  reducedConnections.forEach(([i, j]) => {
    ctx.beginPath();
    ctx.moveTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[j].x, pts[j].y);
    ctx.stroke();
  });

  // 2. Draw reduced set of joints (16 key points)
  // Highlight points: wrist + 5 fingertips
  const highlightPoints = [0, 4, 8, 12, 16, 20]; // Wrist + 5 fingertips
  // Normal points: 1 mid-joint per finger
  const normalPoints = [2, 6, 10, 14, 18]; // Mid-knuckles only

  // Draw normal joint points (smaller, less bright)
  normalPoints.forEach((idx) => {
    const pt = pts[idx];
    
    // Ring
    const ringAlpha = Math.sin(time * 2 + idx * 0.15) * 0.2 + 0.3;
    ctx.strokeStyle = '#00f2fe';
    ctx.globalAlpha = ringAlpha;
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 1.2 * scale;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 8 * scale, 0, Math.PI * 2);
    ctx.stroke();

    // Core point
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#00f2fe';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 2 * scale, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw highlight joint points (larger, brighter)
  highlightPoints.forEach((idx) => {
    const pt = pts[idx];
    const isActive = options.isPinching && (idx === 4 || idx === 8); // Thumb & Index tips
    const isTapPoint = options.isTapping && idx === 8; // Index tip

    // Multiple concentric rings for emphasis
    for (let ringIdx = 0; ringIdx < 3; ringIdx++) {
      const baseRadius = 10 + ringIdx * 8;
      const pulseAmount = Math.sin(time * 2 + idx * 0.3 + ringIdx) * 0.4 + 0.6;
      const ringRadius = baseRadius * scale * pulseAmount;
      const ringAlpha = Math.max(0, 0.6 - ringIdx * 0.2) * (isActive || isTapPoint ? 1 : 0.7);

      ctx.strokeStyle = '#00f2fe';
      ctx.globalAlpha = ringAlpha;
      ctx.shadowColor = '#00f2fe';
      ctx.shadowBlur = 14 + ringIdx * 3;
      ctx.lineWidth = (2 - ringIdx * 0.3) * scale;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Core glowing point (brighter)
    const coreAlpha = Math.sin(time * 2.5 + idx * 0.2) * 0.3 + 0.85;
    ctx.globalAlpha = coreAlpha;
    ctx.fillStyle = '#00f2fe';
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3.5 * scale, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.globalAlpha = 1;

  // 3. (Removed palm outline for cleaner appearance)

  // 4. Gesture: Pinching - connection line between thumb & index
  if (options.isPinching) {
    const thumbTip = pts[4];
    const indexTip = pts[8];
    const midX = (thumbTip.x + indexTip.x) / 2;
    const midY = (thumbTip.y + indexTip.y) / 2;

    // Bright energy line
    ctx.strokeStyle = '#00f2fe';
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 24;
    const lineAlpha = Math.sin(time * 3) * 0.4 + 0.6;
    ctx.globalAlpha = lineAlpha;
    ctx.lineWidth = 3 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(thumbTip.x, thumbTip.y);
    ctx.lineTo(indexTip.x, indexTip.y);
    ctx.stroke();

    // Sparkle stars
    ctx.globalAlpha = 1;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + time * 2;
      const dist = 14 * scale * (Math.sin(time * 2.5) * 0.3 + 0.7);
      const sx = midX + Math.cos(angle) * dist;
      const sy = midY + Math.sin(angle) * dist;

      ctx.fillStyle = '#00f2fe';
      ctx.shadowColor = '#00f2fe';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(sx, sy, 2.2 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  } 
  // 5. Gesture: Tapping - removed laser beam
  else if (options.isTapping) {
    // Index tap visualization removed - keeping hand skeleton only
  }

  ctx.globalAlpha = 1;

  // 6. Label badge
  if (label) {
    const badgeX = p0.x - 40 * scale;
    const badgeY = p0.y + 40 * scale;

    ctx.fillStyle = 'rgba(0, 10, 20, 0.9)';
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 0;

    const badgeText = `◆ ${label}`;
    ctx.font = `700 9px JetBrains Mono, monospace`;
    const textWidth = ctx.measureText(badgeText).width;

    ctx.beginPath();
    ctx.roundRect(badgeX - 6, badgeY - 12, textWidth + 12, 18, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#00f2fe';
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 6;
    ctx.fillText(badgeText, badgeX, badgeY);
  }

  ctx.restore();
}

// Simulated MediaPipe Hand: Pinch & Grab (Slide 1)
function drawSimulatedHandPinch(ctx, targetX, targetY, isWobbling) {
  const time = Date.now() * 0.005;
  const wobbleX = isWobbling ? Math.sin(time * 6) * 14 : 0;
  const wobbleY = isWobbling ? Math.cos(time * 6) * 14 : 0;

  const wristX = targetX + 130 + wobbleX;
  const wristY = targetY + 140 + wobbleY;
  const pinchPtX = targetX + wobbleX;
  const pinchPtY = targetY + wobbleY;

  const pts = [
    { x: wristX, y: wristY }, // 0: Wrist
    { x: wristX - 35, y: wristY - 30 }, // 1: Thumb CMC
    { x: wristX - 68, y: wristY - 56 }, // 2: Thumb MCP
    { x: wristX - 94, y: wristY - 80 }, // 3: Thumb IP
    { x: pinchPtX, y: pinchPtY }, // 4: Thumb Tip
    { x: wristX - 52, y: wristY - 78 }, // 5: Index MCP
    { x: wristX - 78, y: wristY - 98 }, // 6: Index PIP
    { x: wristX - 100, y: wristY - 112 }, // 7: Index DIP
    { x: pinchPtX + 2, y: pinchPtY + 2 }, // 8: Index Tip (pinched)
    { x: wristX - 35, y: wristY - 90 }, // 9: Middle MCP
    { x: wristX - 52, y: wristY - 116 }, // 10: Middle PIP
    { x: wristX - 65, y: wristY - 134 }, // 11: Middle DIP
    { x: wristX - 76, y: wristY - 146 }, // 12: Middle Tip
    { x: wristX - 18, y: wristY - 90 }, // 13: Ring MCP
    { x: wristX - 30, y: wristY - 112 }, // 14: Ring PIP
    { x: wristX - 38, y: wristY - 128 }, // 15: Ring DIP
    { x: wristX - 45, y: wristY - 140 }, // 16: Ring Tip
    { x: wristX, y: wristY - 80 }, // 17: Pinky MCP
    { x: wristX - 6, y: wristY - 100 }, // 18: Pinky PIP
    { x: wristX - 12, y: wristY - 114 }, // 19: Pinky DIP
    { x: wristX - 18, y: wristY - 125 } // 20: Pinky Tip
  ];

  renderTronHandMinimal(ctx, pts, 'Pinch & Grab', {
    isPinching: true
  });
}

// Simple cutting hand indicator (Slide 2)
function drawSimulatedCuttingHand(ctx, x, y) {
  const time = Date.now() * 0.005;
  const bobX = Math.sin(time) * 8;
  const bobY = Math.cos(time) * 4;
  
  // Simulate scissor hand with index and middle fingers open like scissors
  const wristX = x + 60 + bobX;
  const wristY = y + 80 + bobY;

  const pts = [
    { x: wristX, y: wristY },
    { x: wristX - 30, y: wristY - 24 },
    { x: wristX - 54, y: wristY - 42 },
    { x: wristX - 72, y: wristY - 54 },
    { x: wristX - 82, y: wristY - 60 }, // Thumb (curled)
    { x: wristX - 42, y: wristY - 54 },
    { x: wristX - 72 + (Math.sin(time * 1.5) * 15), y: wristY - 84 - (Math.sin(time * 1.5) * 15) }, // Index extended (scissoring)
    { x: wristX - 96 + (Math.sin(time * 1.5) * 20), y: wristY - 108 - (Math.sin(time * 1.5) * 20) },
    { x: x + (Math.sin(time * 1.5) * 15), y: y - (Math.sin(time * 1.5) * 15) }, // Index Tip (extended, moving)
    { x: wristX - 24, y: wristY - 54 },
    { x: wristX - 36 - (Math.sin(time * 1.5) * 15), y: wristY - 72 + (Math.sin(time * 1.5) * 15) }, // Middle extended (scissoring)
    { x: wristX - 42 - (Math.sin(time * 1.5) * 20), y: wristY - 84 + (Math.sin(time * 1.5) * 20) },
    { x: x - (Math.sin(time * 1.5) * 15), y: y + (Math.sin(time * 1.5) * 15) }, // Middle Tip (extended, moving)
    { x: wristX - 12, y: wristY - 50 },
    { x: wristX - 22, y: wristY - 66 },
    { x: wristX - 26, y: wristY - 78 },
    { x: wristX - 29, y: wristY - 84 }, // Ring (curled)
    { x: wristX, y: wristY - 46 },
    { x: wristX - 7, y: wristY - 58 },
    { x: wristX - 12, y: wristY - 67 },
    { x: wristX - 14, y: wristY - 72 }  // Pinky (curled)
  ];

  renderTronHandMinimal(ctx, pts, 'Scissor Cut', {
    isTapping: false
  });
}

function drawSingleHandSkel(ctx, targetX, targetY, isLeft, label) {
  const dir = isLeft ? -1 : 1;
  const wristX = targetX - dir * 95;
  const wristY = targetY + 110;

  const pts = [
    { x: wristX, y: wristY },
    { x: wristX + dir * 24, y: wristY - 24 },
    { x: wristX + dir * 48, y: wristY - 48 },
    { x: wristX + dir * 72, y: wristY - 72 },
    { x: targetX, y: targetY }, // Thumb
    { x: wristX + dir * 36, y: wristY - 60 },
    { x: wristX + dir * 54, y: wristY - 84 },
    { x: wristX + dir * 72, y: wristY - 96 },
    { x: targetX + dir * 2, y: targetY + 2 }, // Index
    { x: wristX + dir * 24, y: wristY - 72 },
    { x: wristX + dir * 36, y: wristY - 96 },
    { x: wristX + dir * 42, y: wristY - 114 },
    { x: wristX + dir * 48, y: wristY - 126 },
    { x: wristX + dir * 12, y: wristY - 72 },
    { x: wristX + dir * 18, y: wristY - 94 },
    { x: wristX + dir * 24, y: wristY - 108 },
    { x: wristX + dir * 26, y: wristY - 120 },
    { x: wristX, y: wristY - 60 },
    { x: wristX + dir * 5, y: wristY - 78 },
    { x: wristX + dir * 7, y: wristY - 90 },
    { x: wristX + dir * 10, y: wristY - 102 }
  ];

  renderTronHandMinimal(ctx, pts, label, {
    isPinching: false
  });
}

// Simulated MediaPipe Index Finger Tap (Slide 3)
function drawSimulatedIndexTap(ctx, tapX, tapY, isActive) {
  const wristX = tapX + 110;
  const wristY = tapY + 130;

  const pts = [
    { x: wristX, y: wristY },
    { x: wristX - 30, y: wristY - 24 },
    { x: wristX - 54, y: wristY - 42 },
    { x: wristX - 72, y: wristY - 54 },
    { x: wristX - 82, y: wristY - 60 }, // Thumb (curled)
    { x: wristX - 42, y: wristY - 54 },
    { x: wristX - 72, y: wristY - 84 },
    { x: wristX - 96, y: wristY - 108 },
    { x: tapX, y: tapY }, // Index Tip (extended to tap node)
    { x: wristX - 24, y: wristY - 54 },
    { x: wristX - 36, y: wristY - 72 },
    { x: wristX - 42, y: wristY - 84 },
    { x: wristX - 46, y: wristY - 90 }, // Middle (curled)
    { x: wristX - 12, y: wristY - 50 },
    { x: wristX - 22, y: wristY - 66 },
    { x: wristX - 26, y: wristY - 78 },
    { x: wristX - 29, y: wristY - 84 }, // Ring (curled)
    { x: wristX, y: wristY - 46 },
    { x: wristX - 7, y: wristY - 58 },
    { x: wristX - 12, y: wristY - 67 },
    { x: wristX - 14, y: wristY - 72 }  // Pinky (curled)
  ];

  renderTronHandMinimal(ctx, pts, 'Index Tap', {
    isTapping: true
  });
}

// ----------------------------------------------------------------------
// SLIDE 4: Rasengan on Palm - Real Camera Feed
// ----------------------------------------------------------------------
function renderSlide4() {
  if (!cvs4 || !ctx4) {
    console.error('Canvas 4 not initialized');
    return;
  }

  const w = cvs4.width;
  const h = cvs4.height;
  ctx4.clearRect(0, 0, w, h);

  // Draw video frame from webcam to canvas (flipped - no mirror)
  const videoElement = document.getElementById('webcamVideo');
  if (videoElement && videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
    // Flip horizontally
    ctx4.save();
    ctx4.scale(-1, 1);
    ctx4.drawImage(videoElement, -w, 0, w, h);
    ctx4.restore();
  }

  // Overlay: Draw the rasengan on palm if hand is detected
  if (userLandmarks && userLandmarks.length > 0) {
    const hand = userLandmarks[0];
    
    // Use the palm center coordinates that were already converted to canvas coordinates in processLiveGestures
    const palmX = simState.slide4.palmCenterX;
    const palmY = simState.slide4.palmCenterY;
    
    // Draw the rasengan on palm if palm is open
    if (simState.slide4.rasenganIntensity > 0) {
      drawRasengan(ctx4, palmX, palmY, simState.slide4.rasenganIntensity);
    }
  } else {
    // No hand detected message
    ctx4.fillStyle = 'rgba(255, 100, 100, 0.7)';
    ctx4.font = '600 24px Outfit, sans-serif';
    ctx4.textAlign = 'center';
    ctx4.textBaseline = 'middle';
    ctx4.fillText('⚠ No hand detected', w / 2, h / 2 - 40);
  }

  // Draw status box
  const statusBox = {
    x: 20,
    y: h - 100,
    w: 320,
    h: 80
  };
  
  ctx4.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx4.strokeStyle = '#00f2fe';
  ctx4.lineWidth = 2;
  
  // Draw rounded rectangle manually
  ctx4.beginPath();
  ctx4.moveTo(statusBox.x + 8, statusBox.y);
  ctx4.lineTo(statusBox.x + statusBox.w - 8, statusBox.y);
  ctx4.quadraticCurveTo(statusBox.x + statusBox.w, statusBox.y, statusBox.x + statusBox.w, statusBox.y + 8);
  ctx4.lineTo(statusBox.x + statusBox.w, statusBox.y + statusBox.h - 8);
  ctx4.quadraticCurveTo(statusBox.x + statusBox.w, statusBox.y + statusBox.h, statusBox.x + statusBox.w - 8, statusBox.y + statusBox.h);
  ctx4.lineTo(statusBox.x + 8, statusBox.y + statusBox.h);
  ctx4.quadraticCurveTo(statusBox.x, statusBox.y + statusBox.h, statusBox.x, statusBox.y + statusBox.h - 8);
  ctx4.lineTo(statusBox.x, statusBox.y + 8);
  ctx4.quadraticCurveTo(statusBox.x, statusBox.y, statusBox.x + 8, statusBox.y);
  ctx4.closePath();
  ctx4.fill();
  ctx4.stroke();

  ctx4.fillStyle = '#00f2fe';
  ctx4.font = '600 14px Outfit, sans-serif';
  ctx4.textAlign = 'left';
  ctx4.textBaseline = 'top';
  ctx4.fillText('Rasengan Intensity:', statusBox.x + 15, statusBox.y + 12);
  ctx4.fillText((simState.slide4.rasenganIntensity * 100).toFixed(0) + '%', statusBox.x + 15, statusBox.y + 35);
  
  ctx4.font = '600 12px Outfit, sans-serif';
  const statusMsg = simState.slide4.palmOpen ? '✓ Palm Open!' : '○ Closed/Detecting';
  ctx4.fillText(statusMsg, statusBox.x + 15, statusBox.y + 58);
}

function drawRasengan(ctx, x, y, intensity) {
  ctx.save();
  const time = Date.now() * 0.003;
  const baseSize = 80;
  const size = baseSize * (0.6 + intensity * 0.6);
  
  // 1. Outer glow - bright cyan/blue
  const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, size * 1.4);
  glowGradient.addColorStop(0, `rgba(100, 200, 255, ${0.6 * intensity})`);
  glowGradient.addColorStop(0.5, `rgba(50, 150, 255, ${0.3 * intensity})`);
  glowGradient.addColorStop(1, 'rgba(30, 100, 200, 0)');
  ctx.fillStyle = glowGradient;
  ctx.beginPath();
  ctx.arc(x, y, size * 1.4, 0, Math.PI * 2);
  ctx.fill();
  
  // 2. Main sphere - blue gradient
  const sphereGradient = ctx.createRadialGradient(x - size * 0.3, y - size * 0.3, 0, x, y, size);
  sphereGradient.addColorStop(0, `rgba(150, 220, 255, ${0.95 * intensity})`);
  sphereGradient.addColorStop(0.4, `rgba(80, 180, 240, ${0.9 * intensity})`);
  sphereGradient.addColorStop(0.8, `rgba(30, 120, 200, ${0.85 * intensity})`);
  sphereGradient.addColorStop(1, `rgba(10, 60, 150, ${0.7 * intensity})`);
  
  ctx.fillStyle = sphereGradient;
  ctx.shadowColor = `rgba(80, 180, 240, ${intensity})`;
  ctx.shadowBlur = 40 * intensity;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
  
  // Rotating spiral curves - multiple rotating spirals
  ctx.globalAlpha = 1;
  ctx.strokeStyle = `rgba(180, 220, 255, ${0.6 * intensity})`;
  ctx.lineWidth = 2.5;
  
  for (let curve = 0; curve < 4; curve++) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((time * (0.8 + curve * 0.2)) % (Math.PI * 2));
    
    ctx.beginPath();
    const spiralSize = size * 0.65;
    for (let angle = 0; angle < Math.PI * 3.5; angle += 0.08) {
      const radius = (angle / (Math.PI * 3.5)) * spiralSize;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (angle === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }
  
  // 5. Bright center core
  const coreGradient = ctx.createRadialGradient(x, y, 0, x, y, size * 0.3);
  coreGradient.addColorStop(0, `rgba(255, 255, 255, ${0.9 * intensity})`);
  coreGradient.addColorStop(0.5, `rgba(200, 240, 255, ${0.5 * intensity})`);
  coreGradient.addColorStop(1, 'rgba(100, 200, 255, 0)');
  
  ctx.fillStyle = coreGradient;
  ctx.globalAlpha = 1;
  ctx.shadowColor = `rgba(200, 240, 255, ${intensity})`;
  ctx.shadowBlur = 30 * intensity;
  ctx.beginPath();
  ctx.arc(x, y, size * 0.3, 0, Math.PI * 2);
  ctx.fill();
  
  // 6. Energy pulses radiating outward
  for (let i = 0; i < 4; i++) {
    const pulseProgress = (time * 3 + i * 0.5) % 1;
    const pulseSize = size * (0.5 + pulseProgress * 0.7);
    const pulseAlpha = (1 - pulseProgress) * 0.5 * intensity;
    
    ctx.strokeStyle = `rgba(150, 220, 255, ${pulseAlpha})`;
    ctx.lineWidth = 2;
    ctx.globalAlpha = pulseAlpha;
    ctx.beginPath();
    ctx.arc(x, y, pulseSize, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  ctx.restore();
}

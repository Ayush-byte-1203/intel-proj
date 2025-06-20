document.addEventListener('DOMContentLoaded', function() {
    // Extract course ID from URL
    const pathParts = window.location.pathname.split('/');
    const courseId = pathParts[pathParts.length - 2];
    
    // Initialize live class
    setupLiveClass(courseId);
    
    // Set up tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            
            // Update active tab button
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Update active tab content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${tabName}-tab`).classList.add('active');
        });
    });
    
    // Set up media controls
    document.getElementById('mute-btn').addEventListener('click', toggleMute);
    document.getElementById('video-btn').addEventListener('click', toggleVideo);
    document.getElementById('screen-share-btn').addEventListener('click', toggleScreenShare);
    document.getElementById('leave-btn').addEventListener('click', leaveClass);
    
    // Chat functionality
    document.getElementById('send-message').addEventListener('click', sendMessage);
    document.getElementById('chat-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') sendMessage();
    });
});

let localStream;
let isMuted = false;
let isVideoOff = false;
let isSharingScreen = false;

async function setupLiveClass(courseId) {
    // Connect to Socket.IO
    const socket = io();
    
    // Join the class room
    socket.emit('join_class', { course_id: courseId });
    
    // Handle user join events
    socket.on('user_joined', (data) => {
        updateParticipantCount(data.participants);
        addSystemMessage(`${data.user} joined the class`);
        addParticipant(data.user);
    });
    
    // Handle user left events
    socket.on('user_left', (data) => {
        updateParticipantCount(data.participants);
        addSystemMessage(`${data.user} left the class`);
        removeParticipant(data.user);
    });
    
    // Handle chat messages
    socket.on('new_message', (data) => {
        addChatMessage(data.user, data.message, false);
    });
    
    // Handle whiteboard updates
    socket.on('whiteboard_updated', (data) => {
        updateWhiteboard(data.drawing, data.user);
    });
    
    // Initialize media
    await initMediaStream(socket, courseId);
    
    // Initialize whiteboard
    initWhiteboard(socket, courseId);
    
    // Store socket for other functions
    window.classSocket = socket;
    window.courseId = courseId;
}

async function initMediaStream(socket, courseId) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        const localVideo = document.getElementById('local-video');
        localVideo.srcObject = localStream;
        
        // For production, you would need to implement WebRTC peer connections here
        // This would involve creating offers/answers and ICE candidates
        
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Could not access camera/microphone. Please check permissions.');
    }
}

function initWhiteboard(socket, courseId) {
    const canvas = document.getElementById('whiteboard');
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    
    // Set default styles
    ctx.strokeStyle = document.getElementById('color-picker').value;
    ctx.lineWidth = document.getElementById('brush-size').value;
    ctx.lineCap = 'round';
    
    // Whiteboard event listeners
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    // Whiteboard tools
    document.getElementById('color-picker').addEventListener('change', function() {
        ctx.strokeStyle = this.value;
    });
    
    document.getElementById('brush-size').addEventListener('input', function() {
        ctx.lineWidth = this.value;
    });
    
    document.getElementById('clear-whiteboard').addEventListener('click', function() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        socket.emit('whiteboard_update', {
            course_id: courseId,
            drawing: { type: 'clear' }
        });
    });
    
    function startDrawing(e) {
        isDrawing = true;
        [lastX, lastY] = [e.offsetX, e.offsetY];
    }
    
    function draw(e) {
        if (!isDrawing) return;
        
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
        
        // Send drawing data to server
        const drawingData = {
            type: 'line',
            from: { x: lastX, y: lastY },
            to: { x: e.offsetX, y: e.offsetY },
            color: ctx.strokeStyle,
            width: ctx.lineWidth
        };
        
        socket.emit('whiteboard_update', {
            course_id: courseId,
            drawing: drawingData
        });
        
        [lastX, lastY] = [e.offsetX, e.offsetY];
    }
    
    function stopDrawing() {
        isDrawing = false;
    }
    
    function updateWhiteboard(drawing, user) {
        if (drawing.type === 'line') {
            ctx.beginPath();
            ctx.moveTo(drawing.from.x, drawing.from.y);
            ctx.lineTo(drawing.to.x, drawing.to.y);
            ctx.strokeStyle = drawing.color || '#000000';
            ctx.lineWidth = drawing.width || 2;
            ctx.stroke();
        } else if (drawing.type === 'clear') {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
}

// Media control functions
function toggleMute() {
    const btn = document.getElementById('mute-btn');
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            isMuted = !isMuted;
            audioTracks[0].enabled = !isMuted;
            btn.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
        }
    }
}

function toggleVideo() {
    const btn = document.getElementById('video-btn');
    if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        if (videoTracks.length > 0) {
            isVideoOff = !isVideoOff;
            videoTracks[0].enabled = !isVideoOff;
            btn.innerHTML = isVideoOff ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
        }
    }
}

async function toggleScreenShare() {
    try {
        if (!isSharingScreen) {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false
            });
            
            // Replace video track in local stream
            const videoTrack = screenStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            await sender.replaceTrack(videoTrack);
            
            videoTrack.onended = () => toggleScreenShare();
            
            isSharingScreen = true;
            document.getElementById('screen-share-btn').innerHTML = '<i class="fas fa-stop"></i>';
        } else {
            // Switch back to camera
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const videoTrack = stream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            await sender.replaceTrack(videoTrack);
            
            isSharingScreen = false;
            document.getElementById('screen-share-btn').innerHTML = '<i class="fas fa-desktop"></i>';
        }
    } catch (error) {
        console.error('Error sharing screen:', error);
    }
}

function leaveClass() {
    if (window.classSocket) {
        window.classSocket.emit('leave_class', { course_id: window.courseId });
    }
    
    // Stop all media tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // Redirect to dashboard
    window.location.href = '/';
}

// Chat functions
function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (message && window.classSocket) {
        window.classSocket.emit('send_message', {
            course_id: window.courseId,
            message: message
        });
        
        addChatMessage('You', message, true);
        input.value = '';
    }
}

function addChatMessage(user, message, isSelf) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    messageElement.className = `chat-message ${isSelf ? 'self' : ''}`;
    messageElement.innerHTML = `
        <div class="message-sender">${user}</div>
        <div class="message-content">${message}</div>
    `;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addSystemMessage(message) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    messageElement.className = 'system-message';
    messageElement.textContent = message;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Participant functions
function updateParticipantCount(count) {
    document.getElementById('participant-count').textContent = count;
}

function addParticipant(name) {
    const list = document.getElementById('participants-list');
    const item = document.createElement('li');
    item.textContent = name;
    list.appendChild(item);
}

function removeParticipant(name) {
    const list = document.getElementById('participants-list');
    const items = Array.from(list.getElementsByTagName('li'));
    const item = items.find(li => li.textContent === name);
    if (item) {
        list.removeChild(item);
    }
}
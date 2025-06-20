class AIIntegration {
    constructor() {
        this.isRecording = false;
        this.recognition = null;
        this.setupEventListeners();
        this.initFaceDetection();
    }

    setupEventListeners() {
        // Mode switching
        document.querySelectorAll('.input-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchMode(btn.dataset.mode));
        });

        // Text submission
        document.getElementById('submit-ai-text').addEventListener('click', () => this.processTextQuery());

        // Voice recording
        document.getElementById('start-ai-voice').addEventListener('click', () => this.toggleVoiceRecording());

        // Image processing
        document.getElementById('ai-image-upload').addEventListener('change', (e) => this.previewImage(e));
        document.getElementById('submit-ai-image').addEventListener('click', () => this.processImageQuery());

        // Response controls
        document.getElementById('read-response').addEventListener('click', () => this.readAloud());
        document.getElementById('copy-response').addEventListener('click', () => this.copyResponse());
    }

    initFaceDetection() {
        Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri('/static/models'),
            faceapi.nets.faceLandmark68Net.loadFromUri('/static/models'),
            faceapi.nets.faceExpressionNet.loadFromUri('/static/models')
        ]).then(() => {
            this.startEngagementMonitoring();
        });
    }

    startEngagementMonitoring() {
        setInterval(async () => {
            const video = document.getElementById('local-video');
            if (video.readyState !== 4) return;

            const detections = await faceapi.detectAllFaces(
                video, 
                new faceapi.TinyFaceDetectorOptions()
            ).withFaceExpressions();

            if (detections.length > 0) {
                const expressions = detections[0].expressions;
                const dominant = Object.entries(expressions).reduce((a, b) => a[1] > b[1] ? a : b);
                this.updateEngagementMeter('student', dominant[0], dominant[1]);
            }
        }, 5000);
    }

    updateEngagementMeter(type, emotion, score) {
        const engagementMap = {
            'happy': 90,
            'neutral': 70,
            'surprised': 60,
            'sad': 40,
            'angry': 30,
            'fearful': 20,
            'disgusted': 10
        };
        
        const value = Math.round(engagementMap[emotion] * score);
        document.getElementById(`${type}-engagement`).style.width = `${value}%`;
        document.getElementById(`${type}-engagement-value`).textContent = `${value}% ${emotion}`;
    }

    switchMode(mode) {
        document.querySelectorAll('.ai-input-container').forEach(el => {
            el.classList.remove('active');
        });
        document.querySelector(`.${mode}-mode`).classList.add('active');
    }

    async processTextQuery() {
        const question = document.getElementById('ai-text-query').value.trim();
        if (!question) return;

        this.showLoading();
        
        try {
            const response = await fetch('/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: question,
                    parameters: { max_new_tokens: 300 }
                })
            });
            const data = await response.json();
            this.displayResponse(data.response || data.error);
        } catch (error) {
            this.displayResponse(`Error: ${error.message}`);
        }
    }

    toggleVoiceRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    startRecording() {
        this.recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        this.recognition.lang = 'en-US';
        
        this.recognition.onstart = () => {
            this.isRecording = true;
            document.getElementById('voice-recording-status').innerHTML = 
                '<i class="fas fa-circle-record"></i> Recording...';
        };

        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            document.getElementById('voice-transcript').textContent = transcript;
            document.getElementById('ai-text-query').value = transcript;
            this.processTextQuery();
        };

        this.recognition.start();
    }

    stopRecording() {
        if (this.recognition) {
            this.recognition.stop();
        }
        this.isRecording = false;
        document.getElementById('voice-recording-status').innerHTML = 
            '<i class="fas fa-microphone-slash"></i> Ready to record';
    }

    previewImage(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.createElement('img');
            img.src = e.target.result;
            const container = document.getElementById('image-preview-container');
            container.innerHTML = '';
            container.appendChild(img);
            document.getElementById('submit-ai-image').disabled = false;
        };
        reader.readAsDataURL(file);
    }

    async processImageQuery() {
        const fileInput = document.getElementById('ai-image-upload');
        if (!fileInput.files.length) return;

        this.showLoading();
        const formData = new FormData();
        formData.append('image', fileInput.files[0]);

        try {
            const response = await fetch('/api/analyze_image', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            this.displayResponse(data.caption || data.error);
        } catch (error) {
            this.displayResponse(`Error: ${error.message}`);
        }
    }

    showLoading() {
        document.getElementById('ai-response-text').innerHTML = 
            '<p><i class="fas fa-spinner fa-spin"></i> Processing...</p>';
    }

    displayResponse(content) {
        document.getElementById('ai-response-text').innerHTML = `<p>${content}</p>`;
    }

    readAloud() {
        const response = document.getElementById('ai-response-text').textContent;
        if (response && window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance(response);
            window.speechSynthesis.speak(utterance);
        }
    }

    copyResponse() {
        const response = document.getElementById('ai-response-text').textContent;
        navigator.clipboard.writeText(response).then(() => {
            alert('Response copied to clipboard!');
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.aiAssistant = new AIIntegration();
});

// UI Controller
class UIController {
    constructor() {
        this.elements = {
            trainButton: document.getElementById('trainButton'),
            generateButton: document.getElementById('generateButton'),
            status: document.getElementById('status'),
            canvas: document.getElementById('generatedImage'),
            progressContainer: document.getElementById('progressContainer'),
            progressFill: document.getElementById('progressFill'),
            progressText: document.getElementById('progressText'),
            progressPhase: document.getElementById('progressPhase'),
            epochCounter: document.getElementById('epochCounter'),
            dLoss: document.getElementById('dLoss'),
            gLoss: document.getElementById('gLoss')
        };
        this.ctx = this.elements.canvas.getContext('2d');
    }

    updateProgress(phase, progress) {
        const percent = Math.round(progress * 100);
        this.elements.progressContainer.style.display = 'block';
        this.elements.progressFill.style.width = `${percent}%`;
        this.elements.progressText.textContent = `${percent}%`;
        this.elements.progressPhase.textContent = phase;
    }

    updateStatus(text) {
        this.elements.status.textContent = text;
    }

    updateMetrics(epoch, totalEpochs, dLoss, gLoss) {
        this.elements.epochCounter.textContent = `${epoch}/${totalEpochs}`;
        this.elements.dLoss.textContent = dLoss.toFixed(4);
        this.elements.gLoss.textContent = gLoss.toFixed(4);
    }

    displayImage(tensor) {
        const imageData = new ImageData(28, 28);
        const data = tensor.dataSync();
        
        for (let i = 0; i < data.length; i++) {
            const idx = i * 4;
            const value = Math.floor(data[i] * 255);
            imageData.data[idx] = value;
            imageData.data[idx + 1] = value;
            imageData.data[idx + 2] = value;
            imageData.data[idx + 3] = 255;
        }

        this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        this.ctx.putImageData(imageData, 0, 0);
        const scale = this.elements.canvas.width / 28;
        this.ctx.drawImage(
            this.elements.canvas, 
            0, 0, 28, 28, 
            0, 0, 28 * scale, 28 * scale
        );
    }

    setTrainingState(isTraining) {
        this.elements.trainButton.textContent = isTraining ? 'Stop Training' : 'Start Training';
        this.elements.generateButton.disabled = isTraining;
    }
}

// WGAN Model
class WGAN {
    constructor() {
        this.latentDim = 128;
        this.batchSize = 50;
        this.discriminator = this.buildDiscriminator();
        this.generator = this.buildGenerator();
        this.dOptimizer = tf.train.adam(1e-4, 0, 0.9);
        this.gOptimizer = tf.train.adam(1e-4, 0, 0.9);
    }

    buildGenerator() {
        const model = tf.sequential({
            layers: [
                tf.layers.dense({
                    units: 4 * 4 * 256,
                    inputShape: [this.latentDim],
                    useBias: false
                }),
                tf.layers.batchNormalization(),
                tf.layers.leakyReLU({alpha: 0.2}),
                tf.layers.reshape({targetShape: [4, 4, 256]}),

                tf.layers.conv2dTranspose({
                    filters: 128,
                    kernelSize: 5,
                    strides: 2,
                    padding: 'same',
                    useBias: false
                }),
                tf.layers.batchNormalization(),
                tf.layers.leakyReLU({alpha: 0.2}),

                tf.layers.conv2dTranspose({
                    filters: 64,
                    kernelSize: 5,
                    strides: 2,
                    padding: 'same',
                    useBias: false
                }),
                tf.layers.batchNormalization(),
                tf.layers.leakyReLU({alpha: 0.2}),

                tf.layers.conv2dTranspose({
                    filters: 1,
                    kernelSize: 5,
                    strides: 2,
                    padding: 'same',
                    activation: 'sigmoid'
                })
            ]
        });
        return model;
    }

    buildDiscriminator() {
        const model = tf.sequential({
            layers: [
                tf.layers.conv2d({
                    filters: 64,
                    kernelSize: 5,
                    strides: 2,
                    padding: 'same',
                    inputShape: [28, 28, 1]
                }),
                tf.layers.leakyReLU({alpha: 0.2}),

                tf.layers.conv2d({
                    filters: 128,
                    kernelSize: 5,
                    strides: 2,
                    padding: 'same'
                }),
                tf.layers.leakyReLU({alpha: 0.2}),

                tf.layers.conv2d({
                    filters: 256,
                    kernelSize: 5,
                    strides: 2,
                    padding: 'same'
                }),
                tf.layers.leakyReLU({alpha: 0.2}),

                tf.layers.flatten(),
                tf.layers.dense({units: 1})
            ]
        });
        return model;
    }

    async trainDiscriminator(realImages) {
        return tf.tidy(() => {
            const noise = tf.randomNormal([this.batchSize, this.latentDim]);
            const generatedImages = this.generator.predict(noise);

            const gradients = () => {
                const realOutput = this.discriminator.predict(realImages);
                const fakeOutput = this.discriminator.predict(generatedImages);
                const discriminatorLoss = tf.mean(fakeOutput.sub(realOutput));
                
                // Gradient penalty
                const epsilon = tf.randomUniform([this.batchSize, 1, 1, 1]);
                const interpolatedImages = realImages.mul(epsilon).add(
                    generatedImages.mul(tf.scalar(1).sub(epsilon))
                );
                const gradientPenalty = this.computeGradientPenalty(interpolatedImages);
                
                return discriminatorLoss.add(gradientPenalty.mul(10));
            };

            const {value, grads} = this.dOptimizer.computeGradients(gradients);
            this.dOptimizer.applyGradients(grads);
            return value;
        });
    }

    computeGradientPenalty(interpolatedImages) {
        return tf.tidy(() => {
            const gradients = tf.grad(x => {
                const predictions = this.discriminator.predict(x);
                return tf.mean(predictions);
            })(interpolatedImages);

            const gradientNorms = tf.sqrt(tf.sum(tf.square(gradients), [1, 2, 3]));
            return tf.mean(tf.square(gradientNorms.sub(1)));
        });
    }

    async trainGenerator() {
        return tf.tidy(() => {
            const noise = tf.randomNormal([this.batchSize, this.latentDim]);
            
            const gradients = () => {
                const generatedImages = this.generator.predict(noise);
                const fakeOutput = this.discriminator.predict(generatedImages);
                return tf.mean(fakeOutput).mul(-1);
            };

            const {value, grads} = this.gOptimizer.computeGradients(gradients);
            this.gOptimizer.applyGradients(grads);
            return value;
        });
    }

    generateImage() {
        return tf.tidy(() => {
            const noise = tf.randomNormal([1, this.latentDim]);
            return this.generator.predict(noise);
        });
    }
}

// Training Controller
class TrainingController {
    constructor(wgan, ui) {
        this.wgan = wgan;
        this.ui = ui;
        this.isTraining = false;
        this.numEpochs = 50;
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.ui.elements.trainButton.onclick = () => this.toggleTraining();
        this.ui.elements.generateButton.onclick = () => this.generateImage();
    }

    async loadMNIST() {
        this.ui.updateStatus('Loading MNIST dataset...');
        
        try {
            const mnist = await tf.data.mnist({
                onProgress: (progress) => {
                    if
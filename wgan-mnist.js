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
        this.batchSize = 64;
        this.discriminator = this.buildDiscriminator();
        this.generator = this.buildGenerator();
        this.dOptimizer = tf.train.adam(1e-4, 0, 0.9);
        this.gOptimizer = tf.train.adam(1e-4, 0, 0.9);
    }

    buildGenerator() {
        const model = tf.sequential();
        
        // Input layer
        model.add(tf.layers.dense({
            units: 7 * 7 * 256,
            inputShape: [this.latentDim],
            useBias: false
        }));
        model.add(tf.layers.batchNormalization());
        model.add(tf.layers.leakyReLU({alpha: 0.2}));
        model.add(tf.layers.reshape({targetShape: [7, 7, 256]}));

        // First deconv layer
        model.add(tf.layers.conv2dTranspose({
            filters: 128,
            kernelSize: 4,
            strides: 2,
            padding: 'same',
            useBias: false
        }));
        model.add(tf.layers.batchNormalization());
        model.add(tf.layers.leakyReLU({alpha: 0.2}));

        // Output layer
        model.add(tf.layers.conv2dTranspose({
            filters: 1,
            kernelSize: 4,
            strides: 2,
            padding: 'same',
            activation: 'tanh'
        }));

        return model;
    }

    buildDiscriminator() {
        const model = tf.sequential();

        // First conv layer
        model.add(tf.layers.conv2d({
            filters: 64,
            kernelSize: 4,
            strides: 2,
            padding: 'same',
            inputShape: [28, 28, 1]
        }));
        model.add(tf.layers.leakyReLU({alpha: 0.2}));

        // Second conv layer
        model.add(tf.layers.conv2d({
            filters: 128,
            kernelSize: 4,
            strides: 2,
            padding: 'same'
        }));
        model.add(tf.layers.layerNormalization());
        model.add(tf.layers.leakyReLU({alpha: 0.2}));

        // Output layer
        model.add(tf.layers.flatten());
        model.add(tf.layers.dense({units: 1}));

        return model;
    }

    async trainDiscriminator(realImages) {
        const batchSize = realImages.shape[0];

        return tf.tidy(() => {
            // Generate fake images
            const noise = tf.randomNormal([batchSize, this.latentDim]);
            const fakeImages = this.generator.predict(noise);

            // Train discriminator
            const gradients = () => {
                const realOutput = this.discriminator.predict(realImages);
                const fakeOutput = this.discriminator.predict(fakeImages);
                
                // Wasserstein loss
                const discriminatorLoss = tf.mean(fakeOutput.sub(realOutput));
                
                // Gradient penalty
                const epsilon = tf.randomUniform([batchSize, 1, 1, 1]);
                const interpolatedImages = realImages.mul(epsilon).add(
                    fakeImages.mul(tf.scalar(1).sub(epsilon))
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
                const fakeImages = this.generator.predict(noise);
                const fakeOutput = this.discriminator.predict(fakeImages);
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
        this.trainImages = null;
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.ui.elements.trainButton.onclick = () => this.toggleTraining();
        this.ui.elements.generateButton.onclick = () => this.generateImage();
    }

    async loadMNIST() {
        this.ui.updateStatus('Loading MNIST dataset...');
        
        try {
            // Load MNIST data
            const data = await tf.data.generator(async function* () {
                const mnist = new Image();
                mnist.src = 'https://storage.googleapis.com/tfjs-tutorials/mnist_images.png';
                await new Promise((resolve, reject) => {
                    mnist.onload = resolve;
                    mnist.onerror = reject;
                });
                
                const canvas = document.createElement('canvas');
                canvas.width = mnist.width;
                canvas.height = mnist.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(mnist, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                
                // Convert to tensor and normalize
                const xs = tf.browser.fromPixels(imageData, 1)
                    .reshape([60000, 28, 28, 1])
                    .cast('float32')
                    .div(255)
                    .sub(0.5) // Normalize to [-0.5, 0.5]
                    .mul(2); // Scale to [-1, 1]
                    
                yield xs;  // Use yield instead of return for generator
            });

            this.ui.updateProgress('Processing dataset', 1);
            await new Promise(resolve => setTimeout(resolve, 500));
            this.ui.elements.progressContainer.style.display = 'none';
            
            return data;
        } catch (error) {
            this.ui.updateStatus(`Error loading dataset: ${error.message}`);
            throw error;
        }
    }

    async train() {
        try {
            if (!this.trainImages) {
                this.trainImages = await this.loadMNIST();
            }

            this.ui.updateStatus('Training started...');
            const numSamples = this.trainImages.shape[0];
            const batchesPerEpoch = Math.floor(numSamples / this.wgan.batchSize);

            for (let epoch = 0; epoch < this.numEpochs && this.isTraining; epoch++) {
                const indices = tf.util.createShuffledIndices(numSamples);
                
                for (let batch = 0; batch < batchesPerEpoch && this.isTraining; batch++) {
                    const startIdx = batch * this.wgan.batchSize;
                    const batchIndices = indices.slice(startIdx, startIdx + this.wgan.batchSize);
                    
                    const batchImages = tf.tidy(() => tf.gather(this.trainImages, batchIndices));

                    // Train discriminator
                    let dLoss = 0;
                    for (let i = 0; i < 5; i++) {
                        dLoss = await this.wgan.trainDiscriminator(batchImages);
                    }

                    // Train generator
                    const gLoss = await this.wgan.trainGenerator();

                    // Update UI
                    this.ui.updateMetrics(
                        epoch + 1,
                        this.numEpochs,
                    dLoss.dataSync()[0], // Corrected: dLoss should be a tensor by now
                    gLoss.dataSync()[0]  // Corrected: gLoss should be a tensor by now
                    );

                    // Generate sample image periodically
                    if (batch % 10 === 0) {
                        const generatedImage = this.wgan.generateImage();
                        this.ui.displayImage(generatedImage.reshape([28, 28]));
                        tf.dispose(generatedImage);
                    }
                tf.dispose([batchImages]);
                    await tf.nextFrame();
                }
            }

            this.ui.updateStatus(this.isTraining ? 'Training completed.' : 'Training stopped.');
            this.isTraining = false;
            this.ui.setTrainingState(false);

        } catch (error) {
            this.ui.updateStatus(`Training error: ${error.message}`);
            console.error(error);
            this.isTraining = false;
            this.ui.setTrainingState(false);
        }
    }

    async toggleTraining() {
        if (!this.isTraining) {
            this.isTraining = true;
            this.ui.setTrainingState(true);
            await this.train();
        } else {
            this.isTraining = false;
            this.ui.setTrainingState(false);
        }
    }

    async generateImage() {
        try {
            const generatedImage = this.wgan.generateImage();
            this.ui.displayImage(generatedImage.reshape([28, 28]));
            tf.dispose(generatedImage);
        } catch (error) {
            this.ui.updateStatus(`Error generating image: ${error.message}`);
        }
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Configure TensorFlow.js
        await tf.setBackend('webgl');
        tf.env().set('WEBGL_DELETE_TEXTURE_THRESHOLD', 0);

        // Create instances
        const ui = new UIController();
        const wgan = new WGAN();
        const trainer = new TrainingController(wgan, ui);

        // Set up error handling
        window.addEventListener('error', (event) => {
            ui.updateStatus(`Error: ${event.message}`);
        });

        // Memory cleanup on page unload
        window.addEventListener('beforeunload', () => {
            tf.dispose();
        });

    } catch (error) {
        console.error('Initialization error:', error);
        document.getElementById('status').textContent = 
            `Failed to initialize: ${error.message}`;
    }
});

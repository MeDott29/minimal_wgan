class ErrorGenerator {
    // ... (previous code remains the same until updateStats method)

    updateStats(result) {
        const stats = this.stats;
        stats.totalTests++;
        
        if (result.success) {
            stats.successfulTests++;
        } else {
            stats.failedTests++;
            const errorType = result.error.type;
            stats.errorTypes.set(errorType, (stats.errorTypes.get(errorType) || 0) + 1);
            stats.errorRates.push({ timestamp: Date.now() });
        }

        stats.totalComplexity += result.complexity;

        // Calculate current error rate
        const now = Date.now();
        stats.errorRates = stats.errorRates.filter(rate => now - rate.timestamp < stats.windowSize);
        const currentErrorRate = (stats.errorRates.length / stats.windowSize) * 1000;
        stats.peakErrorRate = Math.max(stats.peakErrorRate, currentErrorRate);

        // Return all necessary stats for display
        return {
            errorsPerSecond: currentErrorRate,
            successRate: (stats.successfulTests / stats.totalTests) * 100,
            totalTests: stats.totalTests,
            runtime: (now - stats.testStartTime) / 1000,
            peakErrorRate: stats.peakErrorRate,
            avgComplexity: stats.totalComplexity / stats.totalTests,
            failedTests: stats.failedTests,
            successRatio: stats.successfulTests / Math.max(stats.failedTests, 1),
            errorTypes: Array.from(stats.errorTypes.entries())
        };
    }

    async start() {
        if (this.running) return;
        this.running = true;
        this.stats.testStartTime = Date.now();
        this.stats.errorRates = []; // Reset error rates on start

        while (this.running) {
            try {
                const results = await Promise.all(
                    Array(5).fill(0).map(() => this.runTest())
                );
                const updatedStats = results.map(result => this.updateStats(result));
                // Return the last updated stats
                if (this.onUpdate) {
                    this.onUpdate(updatedStats[updatedStats.length - 1]);
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error('Batch error:', error);
            }
        }
    }

    onUpdate(callback) {
        this.onUpdate = callback;
    }
}

class Dashboard {
    // ... (previous code remains the same until startUpdates method)

    startUpdates() {
        this.generator.onUpdate = (stats) => {
            this.updateDisplay(stats);
        };
    }

    updateDisplay(stats) {
        if (!stats) return;

        // Update simple stats with animation
        this.animateValue(this.elements.errorRate, stats.errorsPerSecond, '/s');
        this.animateValue(this.elements.successRate, stats.successRate, '%');
        this.elements.totalTests.textContent = stats.totalTests.toString();
        this.elements.runtime.textContent = `${stats.runtime.toFixed(1)}s`;

        // Update system status
        this.animateValue(this.elements.peakErrorRate, stats.peakErrorRate, '/s');
        this.animateValue(this.elements.avgComplexity, stats.avgComplexity);
        this.elements.failedTests.textContent = stats.failedTests;
        this.elements.successRatio.textContent = stats.successRatio.toFixed(2);

        // Update timeline
        this.updateTimeline(stats.errorsPerSecond);

        // Update error types
        this.updateErrorTypes(stats.errorTypes);

        // Add pulse effect when errors occur
        if (stats.errorsPerSecond > 0) {
            this.elements.errorRate.classList.add('error-pulse');
            setTimeout(() => {
                this.elements.errorRate.classList.remove('error-pulse');
            }, 500);
        }
    }

    animateValue(element, value, suffix = '') {
        const current = parseFloat(element.textContent);
        const target = parseFloat(value);
        if (isNaN(current) || isNaN(target)) {
            element.textContent = value.toFixed(1) + suffix;
            return;
        }
        const step = (target - current) / 10;
        const newValue = current + step;
        element.textContent = newValue.toFixed(1) + suffix;
        if (Math.abs(target - newValue) > 0.1) {
            requestAnimationFrame(() => this.animateValue(element, value, suffix));
        }
    }

    updateErrorTypes(errorTypes) {
        this.elements.errorTypes.innerHTML = '';
        errorTypes.forEach(([type, count]) => {
            const div = document.createElement('div');
            div.className = 'error-type';
            div.innerHTML = `${type}<span class="error-count">${count}</span>`;
            this.elements.errorTypes.appendChild(div);
        });
    }
}

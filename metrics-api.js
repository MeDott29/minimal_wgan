const express = require('express');
const router = express.Router();
const AIMetricsSystem = require('./custom-metrics-db');

const metricsSystem = new AIMetricsSystem();
metricsSystem.init();

router.get('/api/metrics/report', async (req, res) => {
    try {
        const report = await metricsSystem.generateReport();
        res.json(report);
    } catch (error) {
        console.error('Error generating metrics report:', error);
        res.status(500).json({ error: 'Failed to generate metrics report' });
    }
});

module.exports = router;

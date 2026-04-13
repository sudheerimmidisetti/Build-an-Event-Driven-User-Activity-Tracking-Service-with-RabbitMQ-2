const express = require('express');
const router = express.Router();

const { createActivity } = require('../controllers/activityController');

router.post('/events/track', createActivity);

module.exports = router;

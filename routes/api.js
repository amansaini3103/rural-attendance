const express = require('express');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.use(requireAuth);

// RFID scan endpoint
router.post('/rfid-scan', async (req, res) => {
  try {
    const { rfidTagId } = req.body;
    
    const student = await Student.findOne({ rfidTagId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check if already marked for today
    const existingAttendance = await Attendance.findOne({
      studentId: student._id,
      date: { $gte: today }
    });
    
    if (existingAttendance) {
      return res.json({ 
        message: 'Already marked for today',
        student: student.name,
        status: existingAttendance.status
      });
    }
    
    // Mark attendance
    const attendance = new Attendance({
      studentId: student._id,
      schoolId: student.schoolId,
      date: new Date(),
      status: 'present',
      timeIn: new Date(),
      method: 'rfid'
    });
    
    await attendance.save();
    
    res.json({
      message: 'Attendance marked successfully',
      student: student.name,
      status: 'present'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark attendance' });
  }
});

// Get attendance data for charts
router.get('/attendance-data', async (req, res) => {
  try {
    const { schoolId, days = 7 } = req.query;
    
    const attendanceData = [];
    for (let i = parseInt(days) - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      
      const present = await Attendance.countDocuments({
        schoolId,
        date: { $gte: date, $lte: dayEnd },
        status: 'present'
      });
      
      const absent = await Attendance.countDocuments({
        schoolId,
        date: { $gte: date, $lte: dayEnd },
        status: 'absent'
      });
      
      attendanceData.push({
        date: date.toLocaleDateString(),
        present,
        absent
      });
    }
    
    res.json(attendanceData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch attendance data' });
  }
});

// Face recognition endpoint
router.post('/face-recognition', async (req, res) => {
  try {
    const { faceData, schoolId } = req.body;
    
    // In a real implementation, you would:
    // 1. Extract face encodings from the image
    // 2. Compare with stored face encodings
    // 3. Find the best match
    
    // For demo purposes, we'll simulate this
    const students = await Student.find({ schoolId, faceEncoding: { $exists: true } });
    
    // Simulate face matching (replace with actual ML model)
    const matchedStudent = students[0]; // Placeholder
    
    if (!matchedStudent) {
      return res.status(404).json({ error: 'No matching student found' });
    }
    
    // Mark attendance
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const attendance = new Attendance({
      studentId: matchedStudent._id,
      schoolId: matchedStudent.schoolId,
      date: new Date(),
      status: 'present',
      timeIn: new Date(),
      method: 'facial'
    });
    
    await attendance.save();
    
    res.json({
      message: 'Attendance marked via facial recognition',
      student: matchedStudent.name
    });
  } catch (error) {
    res.status(500).json({ error: 'Face recognition failed' });
  }
});

module.exports = router;
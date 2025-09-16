const express = require('express');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

// Apply middleware to all teacher routes
router.use(requireAuth);
router.use(requireRole('teacher'));

// Dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const schoolId = req.session.user.schoolId._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const totalStudents = await Student.countDocuments({ schoolId });
    const todayAttendance = await Attendance.find({ 
      schoolId, 
      date: { $gte: today } 
    }).populate('studentId');
    
    const presentCount = todayAttendance.filter(a => a.status === 'present').length;
    const absentCount = totalStudents - presentCount;
    const attendancePercentage = totalStudents > 0 ? (presentCount / totalStudents * 100).toFixed(1) : 0;
    
    // High-risk students (dropout prediction > 0.7)
    const riskStudents = await Student.find({ 
      schoolId, 
      dropoutRisk: { $gt: 0.7 } 
    }).limit(5);
    
    res.render('teacher/dashboard', {
      user: req.session.user,
      stats: {
        totalStudents,
        presentCount,
        absentCount,
        attendancePercentage
      },
      todayAttendance,
      riskStudents
    });
  } catch (error) {
    res.render('error', { message: 'Error loading dashboard', error });
  }
});

// Students management
router.get('/students', async (req, res) => {
  try {
    const { search, class: className } = req.query;
    const schoolId = req.session.user.schoolId._id;
    
    let query = { schoolId };
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { rollNumber: new RegExp(search, 'i') },
        { rfidTagId: new RegExp(search, 'i') }
      ];
    }
    if (className) {
      query.class = className;
    }
    
    const students = await Student.find(query).sort({ rollNumber: 1 });
    const classes = await Student.distinct('class', { schoolId });
    
    res.render('teacher/students', { 
      user: req.session.user,
      students, 
      classes, 
      search: search || '', 
      selectedClass: className || '' 
    });
  } catch (error) {
    res.render('error', { message: 'Error loading students', error });
  }
});

// Add student
router.get('/students/add', (req, res) => {
  res.render('teacher/add-student', { user: req.session.user, error: null });
});

router.post('/students/add', async (req, res) => {
  try {
    const { name, rollNumber, rfidTagId, class: className, section, parentContact, parentEmail } = req.body;
    const schoolId = req.session.user.schoolId._id;
    
    const student = new Student({
      name, rollNumber, rfidTagId, class: className, section, 
      parentContact, parentEmail, schoolId
    });
    
    await student.save();
    res.redirect('/teacher/students');
  } catch (error) {
    res.render('teacher/add-student', { 
      user: req.session.user, 
      error: 'Failed to add student' 
    });
  }
});

// Attendance records
router.get('/attendance', async (req, res) => {
  try {
    const { date, student, dateFrom, dateTo } = req.query;
    const schoolId = req.session.user.schoolId._id;
    
    let query = { schoolId };
    if (date) {
      const searchDate = new Date(date);
      query.date = {
        $gte: new Date(searchDate.setHours(0, 0, 0, 0)),
        $lt: new Date(searchDate.setHours(23, 59, 59, 999))
      };
    } else if (dateFrom && dateTo) {
      query.date = {
        $gte: new Date(dateFrom),
        $lte: new Date(dateTo)
      };
    } else {
      // Default to today
      const today = new Date();
      query.date = {
        $gte: new Date(today.setHours(0, 0, 0, 0)),
        $lt: new Date(today.setHours(23, 59, 59, 999))
      };
    }
    
    const attendanceQuery = Attendance.find(query)
      .populate('studentId')
      .sort({ date: -1, timeIn: -1 });
    
    if (student) {
      attendanceQuery.where('studentId').equals(student);
    }
    
    const attendance = await attendanceQuery;
    const students = await Student.find({ schoolId }).sort({ name: 1 });
    
    res.render('teacher/attendance', { 
      user: req.session.user,
      attendance, 
      students, 
      filters: { date, student, dateFrom, dateTo } 
    });
  } catch (error) {
    res.render('error', { message: 'Error loading attendance', error });
  }
});

// Manual attendance marking
router.get('/mark-attendance', async (req, res) => {
  try {
    const schoolId = req.session.user.schoolId._id;
    const students = await Student.find({ schoolId }).sort({ rollNumber: 1 });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayAttendance = await Attendance.find({
      schoolId,
      date: { $gte: today }
    });
    
    const attendanceMap = {};
    todayAttendance.forEach(att => {
      attendanceMap[att.studentId.toString()] = att.status;
    });
    
    res.render('teacher/mark-attendance', { 
      user: req.session.user,
      students, 
      attendanceMap 
    });
  } catch (error) {
    res.render('error', { message: 'Error loading attendance form', error });
  }
});

router.post('/mark-attendance', async (req, res) => {
  try {
    const { attendance } = req.body;
    const schoolId = req.session.user.schoolId._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (const [studentId, status] of Object.entries(attendance)) {
      await Attendance.findOneAndUpdate(
        { studentId, schoolId, date: { $gte: today } },
        { 
          status, 
          method: 'manual',
          markedBy: req.session.user.id,
          timeIn: status === 'present' ? new Date() : null
        },
        { upsert: true }
      );
    }
    
    res.redirect('/teacher/attendance');
  } catch (error) {
    res.render('error', { message: 'Error marking attendance', error });
  }
});

// Student profile
router.get('/students/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    const attendanceHistory = await Attendance.find({ studentId: req.params.id })
      .sort({ date: -1 })
      .limit(30);
    
    // Calculate monthly stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const monthlyAttendance = await Attendance.countDocuments({
      studentId: req.params.id,
      status: 'present',
      date: { $gte: thirtyDaysAgo }
    });
    
    const totalDaysInMonth = await Attendance.countDocuments({
      studentId: req.params.id,
      date: { $gte: thirtyDaysAgo }
    });
    
    const monthlyPercentage = totalDaysInMonth > 0 ? 
      (monthlyAttendance / totalDaysInMonth * 100).toFixed(1) : 0;
    
    res.render('teacher/student-profile', { 
      user: req.session.user,
      student, 
      attendanceHistory, 
      monthlyStats: {
        attendance: monthlyAttendance,
        total: totalDaysInMonth,
        percentage: monthlyPercentage
      }
    });
  } catch (error) {
    res.render('error', { message: 'Error loading student profile', error });
  }
});

// Reports
router.get('/reports', (req, res) => {
  res.render('teacher/reports', { user: req.session.user });
});

// Face recognition page
router.get('/facial-recognition', (req, res) => {
  res.render('teacher/facial-recognition', { user: req.session.user });
});

module.exports = router;
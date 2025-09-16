const express = require("express");
const User = require("../models/User");
const Teacher = require("../models/Teacher");
const School = require("../models/School");
const router = express.Router();

router.get("/login", (req, res) => {
  res.render("auth/login", { error: null });
});

router.post("/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (role === "teacher") {
      const teacher = await Teacher.findOne({ email }).populate("schoolId");
      if (!teacher || !(await teacher.comparePassword(password))) {
        return res.render("auth/login", { error: "Invalid credentials" });
      }
      req.session.user = {
        id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        role: "teacher",
        schoolId: teacher.schoolId,
      };
      return res.redirect("/teacher/dashboard");
    }

    const user = await User.findOne({ email }).populate("schoolId");
    if (!user || !(await user.comparePassword(password))) {
      return res.render("auth/login", { error: "Invalid credentials" });
    }
    req.session.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
    };
    if (user.role === "government") {
      return res.redirect("/government/dashboard");
    }
    // Add more roles as needed
    res.redirect("/");
  } catch (error) {
    res.render("auth/login", { error: "Login failed" });
  }
});

router.get("/register", (req, res) => {
  res.render("auth/register", { error: null });
});

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, schoolCode } = req.body;

    let schoolId = null;
    if (role === "teacher") {
      const school = await School.findOne({ code: schoolCode });
      console.log(school)
      if (!school) {
        return res.render("auth/register", { error: "Invalid school code" });
      }
      schoolId = school._id;
      const teacher = new Teacher({ name, email, password, schoolId });
      await teacher.save();
      return res.redirect("/auth/login");
    }

    const user = new User({ name, email, password, role, schoolId });
    await user.save();

    res.redirect("/auth/login");
  } catch (error) {
    res.render("auth/register", { error: "Registration failed" });
  }
});

router.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

module.exports = router;

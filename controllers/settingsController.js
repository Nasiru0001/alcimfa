import Settings from "../models/settingsModel.js";

// Get settings (used to pre-fill the form)
export const getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});

    if (req.accepts("html") && !req.is("json")) {
      return res.render("admin/settings", {
        title: "Settings",
        admin: req.admin,
        adminToken: req.session?.adminToken || null,
        currentSession: settings.session,
        currentTerm: settings.term,
        success: req.query?.success || null,
        error: req.query?.error || null,
      });
    }

    res.json({
      success: true,
      settings: {
        session: settings.session,
        term: settings.term,
      },
    });
  } catch (err) {
    if (req.accepts("html") && !req.is("json")) {
      return res.render("error", { message: err.message });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update session/term
export const updateSessionTerm = async (req, res) => {
  try {
    const { session, term } = req.body;

    if (!session || !term) {
      if (req.accepts("html") && !req.is("json") && !req.xhr) {
        return res.redirect("/admin/settings?error=Session and term are required");
      }
      return res.status(400).json({ success: false, message: "Session and term are required" });
    }

    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ session, term });
    } else {
      settings.session = session;
      settings.term = term;
      await settings.save();
    }

    if (req.accepts("html") && !req.is("json") && !req.xhr) {
      return res.redirect("/admin/settings?success=Session and term updated successfully");
    }

    res.json({ success: true, message: "Session/Term updated successfully" });
  } catch (err) {
    if (req.accepts("html") && !req.is("json") && !req.xhr) {
      return res.redirect("/admin/settings?error=" + encodeURIComponent(err.message));
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

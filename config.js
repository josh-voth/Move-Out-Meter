/*
  Optional owner reporting.

  GitHub Pages is static, so do NOT put email API keys here. If you want emailed
  run summaries, deploy the included Cloudflare Worker and paste its public URL
  into reportEndpoint below.

  For transparency, the app displays reportingNotice whenever reporting is on.
*/
window.MOVE_OUT_CONFIG = {
  reportEndpoint: "",
  reportingNotice: "When you tap “Run my numbers,” a summary of this plan is sent to the person who shared this planner."
};

import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// Parchment, so any letterboxing/background reads as brand rather than black.
Config.setChromiumOpenGlRenderer("angle");

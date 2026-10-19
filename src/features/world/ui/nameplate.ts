/** The scene nameplate's width rule; world.css draws both plates. */

/** The widest name, in ems, that the fixed plate's straight middle holds at its narrowest: 140px wide, below 760px. */
const FIXED_PLATE_EMS = 7;

/** Ems a text takes in the plate's Song face: ASCII is half width, every other character full width. */
const textEms = (text: string) => [...text].reduce((ems, char) => ems + (char.charCodeAt(0) < 0x80 ? .5 : 1), 0);

/** A name the fixed plate cannot hold takes the stretching plate, whose straight middle grows with the name. */
export const wideNameplate = (name: string) => textEms(name) > FIXED_PLATE_EMS;

/** The location HUD's classes for a scene name. */
export const nameplateClass = (name: string) => `world-location-hud${wideNameplate(name) ? ' world-location-hud-wide' : ''}`;

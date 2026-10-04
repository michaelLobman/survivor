/*
 * Season data: the only file edited week to week. See README.md for the
 * weekly routine and every event type.
 */
const LEAGUE = {
  name: "The League Has Spoken",
  tagline: "Outwit, Outplay, Outclass",

  players: [
    { id: "mike", name: "Mike" },
    { id: "annie", name: "Annie" },
    { id: "brandon", name: "Brandon" },
    { id: "kelsey", name: "Kelsey" },
    { id: "mary", name: "Aunt Mary" },
    { id: "michele", name: "Michele" },
    { id: "john", name: "John" },
  ],

  tribes: [
    { id: "toka", name: "Toka", color: "#E3B505" },
    { id: "savu", name: "Savu", color: "#7B3FA0" },
  ],

  // `tribe` is the starting tribe; `short` is the name shown in tight spaces;
  // `occupation` is as CBS lists it (optional); `photo` is optional (initials are shown without it).
  castaways: [
    { id: "alexis", name: "Alexis Levine", occupation: "Criminal defense attorney", tribe: "savu", photo: "img/castaways/alexis.jpg" },
    { id: "ana", name: "Ana Sani", occupation: "Voice actress", tribe: "savu", photo: "img/castaways/ana.jpg" },
    { id: "carter", name: "Carter Krull", occupation: "Livestock farmer", tribe: "savu", photo: "img/castaways/carter.jpg" },
    { id: "cristian", name: "Cristian Chavez", occupation: "Head of HR", tribe: "savu", photo: "img/castaways/cristian.jpg" },
    { id: "eric", name: "Eric Macksoud", occupation: "Mental health counselor", tribe: "savu", photo: "img/castaways/eric.jpg" },
    { id: "kristin", name: "Kristin Flickinger", occupation: "Crisis management", tribe: "savu", photo: "img/castaways/kristin.jpg" },
    { id: "linnea", name: "Linnea Capobianco", occupation: "Entrepreneur", tribe: "savu", photo: "img/castaways/linnea.jpg" },
    { id: "ori", name: "Ori Jean-Charles", occupation: "Personal trainer", tribe: "savu", photo: "img/castaways/ori.jpg" },
    { id: "rob", name: "Rob Antonson", occupation: "Airline gate agent", tribe: "savu", photo: "img/castaways/rob.jpg" },
    { id: "sharonda", name: "Sharonda Cox", occupation: "OBGYN resident", tribe: "savu", photo: "img/castaways/sharonda.jpg" },

    { id: "aaliyah", name: "Aaliyah Puglia", occupation: "Chef", tribe: "toka", photo: "img/castaways/aaliyah.jpg" },
    { id: "brady", name: "Brady Booker", occupation: "Professional wrestler", tribe: "toka", photo: "img/castaways/brady.jpg" },
    { id: "devin", name: "Devin Way", occupation: "Actor", tribe: "toka", photo: "img/castaways/devin.jpg" },
    { id: "jelly", name: "Angelica “Jelly” Loblack", short: "Jelly", occupation: "Sociology professor", tribe: "toka", photo: "img/castaways/jelly.jpg" },
    { id: "jenna", name: "Jenna Doore", occupation: "Wedding photographer", tribe: "toka", photo: "img/castaways/jenna.jpg" },
    { id: "kilby", name: "Danny “Kilby” Kilby", short: "Kilby", occupation: "Game designer", tribe: "toka", photo: "img/castaways/kilby.jpg" },
    { id: "maggie", name: "Maggie Nestor", occupation: "Farmer", tribe: "toka", photo: "img/castaways/maggie.jpg" },
    { id: "pinsky", name: "Mike Pinsky", occupation: "Baseball executive", tribe: "toka", photo: "img/castaways/pinsky.jpg" },
    { id: "patt", name: "Patt Cannaday", occupation: "Federal prosecutor", tribe: "toka", photo: "img/castaways/patt.jpg" },
    { id: "thienan", name: "An “Thien An” Nguyen", short: "Thien An", occupation: "Medical student", tribe: "toka", photo: "img/castaways/thienan.jpg" },

    { id: "lewis", name: "Lewis Kelly", occupation: "Farmer", tribe: null, photo: "img/castaways/lewis.jpg" },
  ],

  // An episode without `events` is upcoming. Add `events` once it has aired.
  episodes: [
    {
      number: 1,
      title: "Permanent Uncertainty",
      airsAt: "2026-09-23T20:00:00-04:00",
      picks: {},
      events: [
        { type: "reward", tribe: "savu" },
        { type: "advantage", castaway: "rob" },
        { type: "immunity", tribe: "savu" },
        { type: "moveTribe", castaway: "lewis", tribe: "toka" },
        { type: "votesAgainst", castaway: "aaliyah", count: 6 },
        { type: "votesAgainst", castaway: "jenna", count: 2 },
        { type: "votedOut", castaway: "aaliyah" },
      ],
    },
    {
      number: 2,
      title: "Weaponized Honesty",
      airsAt: "2026-09-30T20:00:00-04:00",
      picks: { mike: "jenna", annie: "kristin", michele: "carter", brandon: "sharonda", mary: "patt", kelsey: "lewis", john: "maggie" },
      events: [
        { type: "reward", tribe: "toka" },
        { type: "immunity", tribe: "toka" },
        { type: "advantage", castaway: "jelly" },
        { type: "votesAgainst", castaway: "ana", count: 6 },
        { type: "votesAgainst", castaway: "eric", count: 4 },
        { type: "votedOut", castaway: "ana" },
      ],
    },
    {
      number: 3,
      title: "What I’m Smellin’ Is Stinky",
      airsAt: "2026-10-07T20:00:00-04:00",
    },
  ],
};

// Lets the Node tests load this file; ignored in the browser.
if (typeof module === "object" && module.exports) module.exports = LEAGUE;

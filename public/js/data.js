/*
 * Season data: the only file edited week to week. See README.md for the
 * weekly routine and every event type.
 */
const LEAGUE = {
  name: "Survivor Fantasy",
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
  // `photo` is optional (initials are shown without it).
  castaways: [
    { id: "alexis", name: "Alexis Levine", tribe: "savu", photo: "img/castaways/alexis.jpg" },
    { id: "ana", name: "Ana Sani", tribe: "savu", photo: "img/castaways/ana.jpg" },
    { id: "carter", name: "Carter Krull", tribe: "savu", photo: "img/castaways/carter.jpg" },
    { id: "cristian", name: "Cristian Chavez", tribe: "savu", photo: "img/castaways/cristian.jpg" },
    { id: "eric", name: "Eric Macksoud", tribe: "savu", photo: "img/castaways/eric.jpg" },
    { id: "kristin", name: "Kristin Flickinger", tribe: "savu", photo: "img/castaways/kristin.jpg" },
    { id: "linnea", name: "Linnea Capobianco", tribe: "savu", photo: "img/castaways/linnea.jpg" },
    { id: "ori", name: "Ori Jean-Charles", tribe: "savu", photo: "img/castaways/ori.jpg" },
    { id: "rob", name: "Rob Antonson", tribe: "savu", photo: "img/castaways/rob.jpg" },
    { id: "sharonda", name: "Sharonda Cox", tribe: "savu", photo: "img/castaways/sharonda.jpg" },

    { id: "aaliyah", name: "Aaliyah Puglia", tribe: "toka", photo: "img/castaways/aaliyah.jpg" },
    { id: "brady", name: "Brady Booker", tribe: "toka", photo: "img/castaways/brady.jpg" },
    { id: "devin", name: "Devin Way", tribe: "toka", photo: "img/castaways/devin.jpg" },
    { id: "jelly", name: "Angelica “Jelly” Loblack", short: "Jelly", tribe: "toka", photo: "img/castaways/jelly.jpg" },
    { id: "jenna", name: "Jenna Doore", tribe: "toka", photo: "img/castaways/jenna.jpg" },
    { id: "kilby", name: "Danny “Kilby” Kilby", short: "Kilby", tribe: "toka", photo: "img/castaways/kilby.jpg" },
    { id: "maggie", name: "Maggie Nestor", tribe: "toka", photo: "img/castaways/maggie.jpg" },
    { id: "pinsky", name: "Mike Pinsky", tribe: "toka", photo: "img/castaways/pinsky.jpg" },
    { id: "patt", name: "Patt Cannaday", tribe: "toka", photo: "img/castaways/patt.jpg" },
    { id: "thienan", name: "An “Thien An” Nguyen", short: "Thien An", tribe: "toka", photo: "img/castaways/thienan.jpg" },

    { id: "lewis", name: "Lewis Kelly", tribe: null, photo: "img/castaways/lewis.jpg" },
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
      picks: { mike: "jenna", annie: "kristin", michele: "carter", brandon: "sharonda", mary: "patt", kelsey: "lewis" },
    },
  ],
};

// Lets the Node tests load this file; ignored in the browser.
if (typeof module === "object" && module.exports) module.exports = LEAGUE;

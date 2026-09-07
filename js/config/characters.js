// Playable paddlers and how falls hurt them. Trait tuning (STAMINA / SKILL) is in kayak.js.

export const CHARACTERS = {
    ronja: {
      name: 'Ronja', title: 'the Technician', art: 'img/character_sheet_ronja.png',
      desc: 'Grew up slalom racing. Reads water like a book and has hips of steel — but she tires quickly.',
      caps: { skill: 10, stamina: 6, health: 20 }, start: { skill: 1, stamina: 0, health: 10 }, talent: 'skill',
    },
    bram: {
      name: 'Bram', title: 'the Engine',
      desc: 'Ex-rower. Can paddle all day without slowing down, but the boat still surprises him now and then.',
      caps: { skill: 6, stamina: 10, health: 20 }, start: { skill: 0, stamina: 1, health: 10 }, talent: 'stamina',
    },
  };
  
  export const INJURY = { perTier: { easy: 1, medium: 2, hard: 4 } };
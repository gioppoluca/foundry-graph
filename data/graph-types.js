export const GRAPH_TYPES = {
  "enemy-map": {
    "id": "enemy-map",
    "name": "Enemy Map",
    "description": "Map of the enemies of the PCs",
    "background": {
      "image": "modules/foundry-graph/img/relations.webp",
      "width": 2500,
      "height": 1667
    },
    "renderer": "force",
    "color": "#550044",
    "nodeLabelColor": "#000000",
    "version": 1,
    "allowedEntities": ["Actor"],
    "systems": [
      "*"
    ],
    "relations": [
      {
        "id": "enemy-of",
        "label": "Enemy of",
        "color": "#dc143c",
        "style": "solid",
        "strokeWidth": 2
      },
      {
        "id": "ally-of",
        "label": "Ally of",
        "color": "#2ca02c",
        "style": "solid",
        "strokeWidth": 2
      },
      {
        "id": "rival",
        "label": "Rival",
        "color": "#ff8c00",
        "style": "dashed",
        "strokeWidth": 2
      },
      {
        "id": "controls",
        "label": "Controls",
        "color": "#8b0000",
        "style": "solid",
        "strokeWidth": 3
      },
      {
        "id": "fears",
        "label": "Fears",
        "color": "#483d8b",
        "style": "dotted",
        "strokeWidth": 2
      },
      {
        "id": "manipulates",
        "label": "Manipulates",
        "color": "#9370db",
        "style": "dashed",
        "strokeWidth": 2
      },
      {
        "id": "betrayed",
        "label": "Betrayed",
        "color": "#b22222",
        "style": "solid",
        "strokeWidth": 3
      },
      {
        "id": "loves",
        "label": "Loves",
        "color": "#4682b4",
        "style": "dotted",
        "strokeWidth": 1
      },
      {
        "id": "uses",
        "label": "Uses",
        "color": "#696969",
        "style": "dashed",
        "strokeWidth": 2
      },
      {
        "id": "was-allied",
        "label": "Was Allied",
        "color": "#228b22",
        "style": "dotted",
        "strokeWidth": 1
      }
    ]
  },
  "vampire-relations-map": {
    "id": "vampire-relations-map",
    "name": "World of Darkness Relationship Map",
    "description": "Relationship map of the coterie and connections of vampires in a Vampire: The Masquerade game.",
    "background": {
      "image": "modules/foundry-graph/img/vampire-relation-chart.webp",
      "width": 2500,
      "height": 1667
    },
    "renderer": "force",
    "color": "#ff0000",
    "nodeLabelColor": "#ffffff",
    "version": 1,
    "allowedEntities": ["Actor"],
    "systems": [
      "vtm5e",
      "worldofdarkness",
      "vod5e",
    ],
    "relations": [
      {
        "id": "coterie",
        "label": "Coterie member",
        "color": "#1f77b4",
        "style": "solid",
        "noArrow": true,
        "strokeWidth": 2
      },
      {
        "id": "touchstone",
        "label": "Touchstone",
        "color": "#ff7f0e",
        "style": "dashed",
        "strokeWidth": 2
      },
      {
        "id": "sire",
        "label": "Sire",
        "color": "#2ca02c",
        "style": "dotted",
        "strokeWidth": 3
      },
      {
        "id": "ghoul",
        "label": "Ghoul",
        "color": "#d62728",
        "style": "solid",
        "strokeWidth": 2
      },
      {
        "id": "blood-slave",
        "label": "Blood Slave",
        "color": "#9467bd",
        "style": "dashed",
        "strokeWidth": 2
      },
      {
        "id": "allies",
        "label": "Allies",
        "color": "#8c564b",
        "style": "solid",
        "strokeWidth": 2
      },
      {
        "id": "friends",
        "label": "Friends",
        "color": "#e377c2",
        "style": "dotted",
        "strokeWidth": 1
      },
      {
        "id": "mawla",
        "label": "Mawla/Monitor",
        "color": "#7f7f7f",
        "style": "solid",
        "strokeWidth": 2
      },
      {
        "id": "henchman",
        "label": "Henchman/Employed",
        "color": "#bcbd22",
        "style": "dashed",
        "strokeWidth": 2
      },
      {
        "id": "herd",
        "label": "Herd",
        "color": "#17becf",
        "style": "dotted",
        "strokeWidth": 1
      },
      {
        "id": "indebted",
        "label": "Indebted",
        "color": "#ffa500",
        "style": "dashed",
        "strokeWidth": 2
      },
      {
        "id": "enemies",
        "label": "Enemies/Adversary",
        "color": "#dc143c",
        "style": "solid",
        "strokeWidth": 3
      },
      {
        "id": "dating",
        "label": "Dating/Lovers",
        "color": "#ff69b4",
        "style": "dotted",
        "strokeWidth": 2
      },
      {
        "id": "associates",
        "label": "Associates with",
        "color": "#808000",
        "style": "solid",
        "strokeWidth": 2
      },
      {
        "id": "prince",
        "label": "Prince of",
        "color": "#808000",
        "style": "solid",
        "strokeWidth": 2
      },
      {
        "id": "baron",
        "label": "Baron of",
        "color": "#808000",
        "style": "solid",
        "strokeWidth": 2
      },
      {
        "id": "cell-leader",
        "label": "Cell Leader of",
        "color": "#808000",
        "style": "solid",
        "strokeWidth": 2
      },
      {
        "id": "hierophant",
        "label": "Hierophant of",
        "color": "#808000",
        "style": "solid",
        "strokeWidth": 2
      },
      {
        "id": "alpha",
        "label": "Alpha of",
        "color": "#808000",
        "style": "solid",
        "strokeWidth": 2
      },
      {
        "id": "descendant",
        "label": "Descendant",
        "color": "#4682b4",
        "style": "dashed",
        "strokeWidth": 2
      },
      {
        "id": "unclassified",
        "label": "Unclassified Connection",
        "color": "#999999",
        "style": "solid",
        "strokeWidth": 1
      }
    ]
  },
  "faction-power-structure": {
    "id": "faction-power-structure",
    "name": "Faction Power Structure",
    "description": "Map the internal hierarchy, influence flow, and inter-faction connections among guilds, sects, noble houses, cults, or political groups.",
    "background": {
      "image": "modules/foundry-graph/img/relations.webp",
      "width": 2500,
      "height": 1667
    },
    "renderer": "force",
    "color": "#0000aa",
    "nodeLabelColor": "#000000",
    "version": 1,
    "allowedEntities": ["Actor"],
    "width": 1200,
    "height": 900,
    "systems": [
      "*"
    ],
    "relations": [
      {
        "id": "commands",
        "label": "Commands",
        "color": "#8b0000",
        "style": "solid",
        "strokeWidth": 2.5
      },
      {
        "id": "supports",
        "label": "Supports",
        "color": "#006400",
        "style": "dashed",
        "strokeWidth": 2
      },
      {
        "id": "influences",
        "label": "Influences",
        "color": "#1e90ff",
        "style": "dotted",
        "strokeWidth": 2
      },
      {
        "id": "funds",
        "label": "Funds",
        "color": "#daa520",
        "style": "dashed",
        "strokeWidth": 2
      },
      {
        "id": "spies-on",
        "label": "Spies On",
        "color": "#ff4500",
        "style": "dotted",
        "strokeWidth": 1.5
      },
      {
        "id": "rivals",
        "label": "Rivals",
        "color": "#800080",
        "style": "solid",
        "strokeWidth": 2.5
      },
      {
        "id": "secretly-controls",
        "label": "Secretly Controls",
        "color": "#4b0082",
        "style": "dotted",
        "strokeWidth": 2
      },
      {
        "id": "public-ally",
        "label": "Public Ally",
        "color": "#2e8b57",
        "style": "solid",
        "strokeWidth": 2
      },
      {
        "id": "unknown",
        "label": "Unknown or Rumored Link",
        "color": "#aaaaaa",
        "style": "dashed",
        "strokeWidth": 1.5
      }
    ]
  },
  "character-map": {
    "id": "character-map",
    "name": "Character Relationship Map",
    "description": "A flexible map for visualizing PCs, NPCs, enemies, allies, and all their connections in your campaign.",
    "background": {
      "image": "modules/foundry-graph/img/relations.webp",
      "width": 2500,
      "height": 1667
    },
    "renderer": "force",
    "color": "#ffffff",
    "nodeLabelColor": "#000000",
    "version": 1,
    "allowedEntities": ["Actor"],
    "width": 1000,
    "height": 800,
    "systems": [
      "*"
    ],
    "relations": [
      {
        "id": "pc-pc",
        "label": "Party Member",
        "color": "#1f77b4",
        "style": "solid",
        "strokeWidth": 2
      },
      {
        "id": "npc-ally",
        "label": "Trusted Ally",
        "color": "#2ca02c",
        "style": "solid",
        "strokeWidth": 2
      },
      {
        "id": "npc-contact",
        "label": "Informant/Contact",
        "color": "#ff7f0e",
        "style": "dotted",
        "strokeWidth": 2
      },
      {
        "id": "npc-enemy",
        "label": "Enemy",
        "color": "#d62728",
        "style": "solid",
        "strokeWidth": 3
      },
      {
        "id": "npc-neutral",
        "label": "Acquaintance",
        "color": "#999999",
        "style": "dashed",
        "strokeWidth": 1.5
      },
      {
        "id": "npc-familiar",
        "label": "Family/Relative",
        "color": "#8c564b",
        "style": "solid",
        "strokeWidth": 2
      },
      {
        "id": "npc-lover",
        "label": "Romantic Interest",
        "color": "#e377c2",
        "style": "dotted",
        "strokeWidth": 2
      },
      {
        "id": "npc-mentor",
        "label": "Mentor/Trainer",
        "color": "#bcbd22",
        "style": "dashed",
        "strokeWidth": 2
      },
      {
        "id": "npc-rival",
        "label": "Rival",
        "color": "#17becf",
        "style": "dashed",
        "strokeWidth": 2.5
      },
      {
        "id": "unclassified",
        "label": "Unclassified Connection",
        "color": "#aaaaaa",
        "style": "solid",
        "strokeWidth": 1
      }
    ]
  },
  "genealogy-tree": {
    "id": "genealogy-tree",
    "name": "Genealogy Tree",
    "description": "Maps out familial, bloodline, or ancestral relationships between individuals or creatures — from mortal dynasties to vampiric sires and mythic progenitors.",
    "background": {
      "image": "modules/foundry-graph/img/tree.webp",
      "width": 2500,
      "height": 1667
    },
    "renderer": "genealogy",
    "width": 1200,
    "height": 800,
    "color": "#226633",
    "nodeLabelColor": "#000000",
    "version": 1,
    "allowedEntities": ["Actor"],
    "systems": [
      "*"
    ],
    "relations": [
      {
        "id": "child-of",
        "label": "Child Of",
        "color": "#1f77b4",
        "style": "solid",
        "strokeWidth": 2
      },
      {
        "id": "parent-of",
        "label": "Parent Of",
        "color": "#1f77b4",
        "style": "solid",
        "strokeWidth": 2
      },
      {
        "id": "spouse-of",
        "label": "Spouse Of",
        "color": "#d62728",
        "style": "solid",
        "strokeWidth": 3
      }
    ]
  }
}
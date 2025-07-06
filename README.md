- ![](https://img.shields.io/badge/Foundry-v12-informational)![](https://img.shields.io/badge/Foundry-v13-informational)
- ![Latest Release Download Count](https://img.shields.io/github/downloads/gioppoluca/foundry-graph/latest/module.zip)
- ![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Ffoundry-graph&colorB=4aa94a)

# Foundry Graph - Visual Relationship Mapping

Foundry Graph is a powerful and intuitive module that lets you visually map relationships between actors, scenes, items, or any other entity in your world. Whether you're managing political intrigue, faction conflicts, character connections, or ancient bloodlines, this tool gives you a dynamic canvas to build, edit, and explore complex networks.
You can choose between a set of graph types and create your **relation map**
![graph example](doc/graph_example.png)

| Graph type     | System    | Description                                                                          |
| ----------------- | ------------ | ------------------------------------------------------------------------------ |
| Relations Map     | WoD   | The relation map for a coterie or a single character, with dedicated relations   |
| Enemy Map     | any   | The classical map between generic Actors  |



✨ Features
- **Interactive Graph Builder**: with drag-and-drop node placement and zoom/pan support.
- **Custom Graph Types**: (e.g., "Enemy Map", "Coterie Web", "Political Factions").
- **Relation Styling**: Each relationship type can have a unique color, line style, and width (e.g., dashed red for "Enemy", dotted green for "Ally").
- **Link & Node Management**: Easily link or unlink entities, edit metadata, and delete with a right double-click.
- **Background Support**: Set a background image for your graph to anchor it in a visual context (maps, floor plans, etc.) [at the moment linked to the graph type, but planned to make it custom].
- **Persistent Storage**: Graphs are saved and managed per world, supporting editing, exporting, and rendering as SVG.

🧩 Use Cases
- Track political alliances and betrayals in a Game of Thrones-style intrigue.
- Build a vampire lineage and coterie relationship web for World of Darkness.
- Visualize quest dependencies and how NPCs are tied to objectives.
- Map out interconnected factions in a sandbox world.
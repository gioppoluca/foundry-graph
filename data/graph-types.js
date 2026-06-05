const FG_SYMBOL_ICON = (label, stroke = "#00eaff") => {
  const safeLabel = String(label ?? "").replace(/[<>&"']/g, "");
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="128" height="128" rx="18" fill="rgba(4,12,24,0.92)"/><path d="M26 18h76l20 20v52l-20 20H26L6 90V38z" fill="none" stroke="${stroke}" stroke-width="5" filter="url(#g)"/><circle cx="64" cy="64" r="30" fill="none" stroke="${stroke}" stroke-width="3" opacity="0.75"/><text x="64" y="71" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="${stroke}">${safeLabel}</text></svg>`)}`;
};

export const GRAPH_TYPES = {
  "osm-world-map": {
    "id": "osm-world-map",
    "name": "Geographical Map",
    "description": "A Leaflet (OpenStreetMap or Raster) map that stores draggable markers (Actors/Scenes/Items/Journal pages) with real-world coordinates.",
    "themes": [
      {
        "id": "earth",
        "label": "Earth Map",
        "width": 800,
        "height": 600,
        "mapSource": {
          "operator": "earth",
          "type": "tile",
          "crs": "earth",
          "defaultBaseLayerId": "street",
          "baseLayers": [
            {
              "id": "street",
              "label": "Street",
              "url": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
              "options": {
                "maxZoom": 19,
                "maxNativeZoom": 19,
                "crossOrigin": "anonymous",
                "attribution": "&copy; OpenStreetMap contributors"
              }
            },
            {
              "id": "satellite",
              "label": "Satellite",
              "url": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              "options": {
                "maxZoom": 19,
                "maxNativeZoom": 19,
                "crossOrigin": "anonymous",
                "attribution": "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
              }
            }
          ],
          "search": {
            "type": "nominatim",
            "url": "https://nominatim.openstreetmap.org/search",
            "limit": 5
          },
          "scaledScene": {
            "enabled": true,
            "scaleMode": "webMercator",
            "minGridSize": 20,
            "feetPerSquare": 5,
            "maxScale": 4,
            "minimumZoomOffsetFromMaxNative": 1
          },
          "walls": {
            "enabled": true,
            "type": "osm-buildings",
            "overpassUrl": "https://overpass-api.de/api/interpreter"
          }
        }
      },
      {
        "id": "custom-image",
        "label": "Custom Image Map",
        "width": 800,
        "height": 600,
        "mapSource": {
          "operator": "image",
          "type": "image",
          "crs": "simple",
          "imageFrom": "background",
          "minZoom": -5,
          "maxZoom": 5,
          "maxBoundsPadding": 0.25,
          "scaledScene": {
            "enabled": false
          },
          "walls": {
            "enabled": false
          }
        }
      },
      {
        "id": "toril-gis",
        "label": "Toril GIS",
        "width": 800,
        "height": 600,
        "enabled": false,
        "mapSource": {
          "operator": "geojson",
          "type": "geojson",
          "crs": "toril-gcs",
          "leafletCrs": "toril-gcs",
          "projection": "lonlat",
          "primeMeridian": "FRIA",
          "bounds": [[-90, -180], [90, 180]],
          "defaultCenter": [25, -75],
          "defaultZoom": 3,
          "minZoom": 1,
          "maxZoom": 8,
          "maxBoundsPadding": 0.1,
          "layersControl": "checkbox",
          "attribution": "Toril GIS data by Geospatial Grimoire",
          "rasterOverlays": [
            {
              "id": "terrain-relief",
              "group": "Terrain",
              "label": "Elevation Relief",
              "url": "modules/foundry-graph/assets/maps/toril-gis/rasters/toril_relief_4096.png",
              "bounds": [[-90, -180], [90, 180]],
              "order": 62,
              "opacity": 0.28,
              "blendMode": "overlay",
              "enabled": false,
              "className": "fg-map-raster-relief"
            },
            {
              "id": "terrain-hillshade",
              "group": "Terrain",
              "label": "Hillshade",
              "url": "modules/foundry-graph/assets/maps/toril-gis/rasters/toril_hillshade_4096.png",
              "bounds": [[-90, -180], [90, 180]],
              "order": 65,
              "opacity": 0.42,
              "blendMode": "multiply",
              "enabled": false,
              "className": "fg-map-raster-hillshade"
            }
          ],
          "crsDefinition": {
            "format": "precomputed-leaflet",
            "wktUrl": "modules/foundry-graph/assets/maps/toril-gis/crs/toril_gcs.wkt",
            "semiMajorAxis": 6410000,
            "inverseFlattening": 160.25,
            "primeMeridian": "FRIA",
            "projection": "lonlat"
          },
          "labelProperties": ["name_en", "name", "name_abb_en", "uuid"],
          "layers": [
            {
              "id": "surface-ocean",
              "group": "Surface",
              "label": "Ocean",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/srf_nat_ocean_pg.geojson",
              "role": "polygon",
              "order": 0,
              "style": {
                "color": "#4f9ed8",
                "fillColor": "#6bb7df",
                "weight": 1,
                "opacity": 0.7,
                "fillOpacity": 0.55
              },
              "enabled": true
            },
            {
              "id": "surface-land",
              "group": "Surface",
              "label": "Land",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/srf_nat_land_pg.geojson",
              "role": "polygon",
              "order": 10,
              "style": {
                "color": "#6c7f3f",
                "fillColor": "#d8c58a",
                "weight": 1,
                "opacity": 0.8,
                "fillOpacity": 0.65
              },
              "enabled": true
            },
            {
              "id": "surface-sea-ice",
              "group": "Surface",
              "label": "Sea Ice",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/srf_nat_sea_ice_pg.geojson",
              "role": "polygon",
              "order": 20,
              "style": {
                "color": "#bdd6df",
                "fillColor": "#edf6fa",
                "weight": 0.8,
                "opacity": 0.7,
                "fillOpacity": 0.55
              },
              "enabled": false
            },
            {
              "id": "surface-land-cover",
              "group": "Surface",
              "label": "Land Cover",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/srf_nat_land_cover_pg.geojson",
              "role": "polygon",
              "order": 30,
              "styleByProperty": "feature_class",
              "style": {
                "color": "#8a7a4a",
                "fillColor": "#c9b979",
                "weight": 0.5,
                "opacity": 0.45,
                "fillOpacity": 0.35
              },
              "styles": {
                "Sand": {
                  "color": "#b89a4c",
                  "fillColor": "#d6bd72",
                  "weight": 0.5,
                  "opacity": 0.55,
                  "fillOpacity": 0.48
                },
                "Temperate Forest": {
                  "color": "#3f7038",
                  "fillColor": "#4f8b45",
                  "weight": 0.5,
                  "opacity": 0.5,
                  "fillOpacity": 0.38
                },
                "Tropical Forest": {
                  "color": "#245f36",
                  "fillColor": "#2f7d47",
                  "weight": 0.5,
                  "opacity": 0.55,
                  "fillOpacity": 0.42
                },
                "Boreal Forest": {
                  "color": "#4f7658",
                  "fillColor": "#5f8f6b",
                  "weight": 0.5,
                  "opacity": 0.5,
                  "fillOpacity": 0.36
                },
                "Swamp": {
                  "color": "#4d5d35",
                  "fillColor": "#617443",
                  "weight": 0.5,
                  "opacity": 0.55,
                  "fillOpacity": 0.42
                },
                "Marsh": {
                  "color": "#637242",
                  "fillColor": "#7b8f52",
                  "weight": 0.5,
                  "opacity": 0.5,
                  "fillOpacity": 0.38
                },
                "Ricefield": {
                  "color": "#819052",
                  "fillColor": "#9caf6b",
                  "weight": 0.5,
                  "opacity": 0.5,
                  "fillOpacity": 0.35
                },
                "Glacier": {
                  "color": "#a7c7d2",
                  "fillColor": "#dcecf2",
                  "weight": 0.5,
                  "opacity": 0.65,
                  "fillOpacity": 0.58
                },
                "Ice Sheet": {
                  "color": "#bdd6df",
                  "fillColor": "#edf6fa",
                  "weight": 0.5,
                  "opacity": 0.65,
                  "fillOpacity": 0.62
                },
                "Blackened Earth": {
                  "color": "#28231f",
                  "fillColor": "#3c352f",
                  "weight": 0.5,
                  "opacity": 0.65,
                  "fillOpacity": 0.45
                }
              },
              "enabled": false
            },
            {
              "id": "surface-land-regions",
              "group": "Surface",
              "label": "Land Regions / Terrain Forms",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/srf_nat_land_regions_pg.geojson",
              "role": "polygon",
              "order": 40,
              "styleByProperty": "feature_class",
              "style": {
                "color": "#8d7958",
                "fillColor": "#bfa979",
                "weight": 0.8,
                "opacity": 0.65,
                "fillOpacity": 0.16
              },
              "styles": {
                "Landform/Hills": {
                  "color": "#8f7b4a",
                  "fillColor": "#b99b5e",
                  "weight": 0.8,
                  "opacity": 0.65,
                  "fillOpacity": 0.2
                },
                "Landform/Upland": {
                  "color": "#7a6b4f",
                  "fillColor": "#a99370",
                  "weight": 0.8,
                  "opacity": 0.65,
                  "fillOpacity": 0.18
                },
                "Landform/Plateau": {
                  "color": "#9b7b4f",
                  "fillColor": "#c09c66",
                  "weight": 0.8,
                  "opacity": 0.65,
                  "fillOpacity": 0.16
                },
                "Landform/Chasm": {
                  "color": "#4a3425",
                  "fillColor": "#6a4a37",
                  "weight": 1.2,
                  "opacity": 0.8,
                  "fillOpacity": 0.22
                },
                "Landform/Depression": {
                  "color": "#6b5b50",
                  "fillColor": "#8f8177",
                  "weight": 0.8,
                  "opacity": 0.65,
                  "fillOpacity": 0.15
                },
                "Landform/Rift": {
                  "color": "#4a3425",
                  "fillColor": "#8a4d3b",
                  "weight": 1.2,
                  "opacity": 0.8,
                  "fillOpacity": 0.18
                }
              },
              "enabled": false
            },
            {
              "id": "surface-lakes",
              "group": "Surface",
              "label": "Lakes",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/srf_nat_lakes_pg.geojson",
              "role": "polygon",
              "order": 50,
              "style": {
                "color": "#4f9ed8",
                "fillColor": "#87cdea",
                "weight": 1,
                "opacity": 0.8,
                "fillOpacity": 0.65
              },
              "enabled": true
            },
            {
              "id": "surface-lake-islands",
              "group": "Surface",
              "label": "Lake Islands",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/srf_nat_lake_islands_pg.geojson",
              "role": "polygon",
              "order": 55,
              "style": {
                "color": "#6c7f3f",
                "fillColor": "#d8c58a",
                "weight": 0.8,
                "opacity": 0.8,
                "fillOpacity": 0.65
              },
              "enabled": false
            },
            {
              "id": "surface-marine-regions",
              "group": "Surface",
              "label": "Marine Regions",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/srf_nat_marine_regions_pg.geojson",
              "role": "polygon",
              "order": 60,
              "style": {
                "color": "#2f7ba7",
                "fillColor": "#5aa9cf",
                "weight": 0.8,
                "opacity": 0.55,
                "fillOpacity": 0.18
              },
              "enabled": false
            },
            {
              "id": "surface-regions",
              "group": "Surface",
              "label": "Named Regions",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/srf_con_named_regions_pg.geojson",
              "role": "polygon",
              "order": 70,
              "style": {
                "color": "#7a4f9a",
                "fillColor": "#c8a9dc",
                "weight": 1.25,
                "opacity": 0.9,
                "fillOpacity": 0.18
              },
              "enabled": false
            },
            {
              "id": "surface-time-zones",
              "group": "Surface",
              "label": "Time Zones",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/srf_con_time_zones_pg.geojson",
              "role": "polygon",
              "order": 75,
              "style": {
                "color": "#b8842d",
                "fillColor": "#d9b36b",
                "weight": 0.8,
                "opacity": 0.55,
                "fillOpacity": 0.12
              },
              "enabled": false
            },
            {
              "id": "surface-rivers",
              "group": "Surface",
              "label": "Rivers",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/srf_nat_rivers_ln.geojson",
              "role": "line",
              "order": 80,
              "style": {
                "color": "#4f9ed8",
                "weight": 1.5,
                "opacity": 0.85
              },
              "enabled": true
            },
            {
              "id": "surface-linear-landmarks",
              "group": "Surface",
              "label": "Linear Landmarks",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/srf_nat_linear_landmarks_ln.geojson",
              "role": "line",
              "order": 85,
              "style": {
                "color": "#5b4636",
                "weight": 1.4,
                "opacity": 0.75,
                "dashArray": "6 3"
              },
              "enabled": false
            },
            {
              "id": "surface-pathways",
              "group": "Surface",
              "label": "Pathways",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/srf_civ_pathways_ln.geojson",
              "role": "line",
              "order": 90,
              "style": {
                "color": "#8b5a2b",
                "weight": 1.5,
                "opacity": 0.85,
                "dashArray": "4 4"
              },
              "enabled": true
            },
            {
              "id": "surface-geographic-lines",
              "group": "Reference",
              "label": "Geographic Lines",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/glb_con_geographic_lines_ln.geojson",
              "role": "line",
              "order": 95,
              "styleByProperty": "feature_class",
              "style": {
                "color": "#6d6d6d",
                "weight": 0.8,
                "opacity": 0.55,
                "dashArray": "6 6"
              },
              "styles": {
                "Equator": {
                  "color": "#aa7a2a",
                  "weight": 1.2,
                  "opacity": 0.75,
                  "dashArray": "8 6"
                },
                "Prime meridian": {
                  "color": "#8f4f88",
                  "weight": 1.2,
                  "opacity": 0.75,
                  "dashArray": "8 6"
                },
                "Tropic circle": {
                  "color": "#6d6d6d",
                  "weight": 0.8,
                  "opacity": 0.6,
                  "dashArray": "6 6"
                },
                "Polar circle": {
                  "color": "#6d6d6d",
                  "weight": 0.8,
                  "opacity": 0.6,
                  "dashArray": "6 6"
                }
              },
              "enabled": false
            },
            {
              "id": "surface-important-sites",
              "group": "Surface",
              "label": "Important Sites",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/srf_civ_important_sites_pt.geojson",
              "role": "point",
              "order": 100,
              "radius": 4,
              "styleByProperty": "feature_class",
              "style": {
                "color": "#6b2418",
                "fillColor": "#d96b4c",
                "weight": 1,
                "opacity": 0.95,
                "fillOpacity": 0.9
              },
              "styles": {
                "Ruins": {
                  "color": "#5f4234",
                  "fillColor": "#9d7863",
                  "weight": 1,
                  "opacity": 0.95,
                  "fillOpacity": 0.9
                },
                "Fortification": {
                  "color": "#4f2a1f",
                  "fillColor": "#c85d3c",
                  "weight": 1,
                  "opacity": 0.95,
                  "fillOpacity": 0.9
                },
                "Battlefield": {
                  "color": "#5b1f1f",
                  "fillColor": "#ba4d4d",
                  "weight": 1,
                  "opacity": 0.95,
                  "fillOpacity": 0.9
                },
                "Inn": {
                  "color": "#5a3818",
                  "fillColor": "#d9a14c",
                  "weight": 1,
                  "opacity": 0.95,
                  "fillOpacity": 0.9
                },
                "Cave": {
                  "color": "#2d2630",
                  "fillColor": "#6b5a70",
                  "weight": 1,
                  "opacity": 0.95,
                  "fillOpacity": 0.9
                },
                "Portal": {
                  "color": "#25265c",
                  "fillColor": "#7e8cff",
                  "weight": 1,
                  "opacity": 0.95,
                  "fillOpacity": 0.9
                }
              },
              "enabled": false
            },
            {
              "id": "surface-landmarks",
              "group": "Surface",
              "label": "Natural Landmarks",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/srf_nat_landmarks_pt.geojson",
              "role": "point",
              "order": 105,
              "radius": 4,
              "style": {
                "color": "#2f4b24",
                "fillColor": "#87b56a",
                "weight": 1,
                "opacity": 0.95,
                "fillOpacity": 0.9
              },
              "enabled": false
            },
            {
              "id": "surface-places",
              "group": "Surface",
              "label": "Populated Places",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/srf_civ_populated_places_pt.geojson",
              "role": "point",
              "order": 110,
              "radius": 4,
              "styleByProperty": "feature_class",
              "style": {
                "color": "#4b2f18",
                "fillColor": "#f2d16b",
                "weight": 1,
                "opacity": 0.95,
                "fillOpacity": 0.9
              },
              "styles": {
                "City": {
                  "color": "#4b2f18",
                  "fillColor": "#f2b84b",
                  "weight": 1.25,
                  "opacity": 0.95,
                  "fillOpacity": 0.95
                },
                "Town": {
                  "color": "#4b2f18",
                  "fillColor": "#f2d16b",
                  "weight": 1,
                  "opacity": 0.95,
                  "fillOpacity": 0.9
                },
                "Village": {
                  "color": "#4b2f18",
                  "fillColor": "#fff0a8",
                  "weight": 1,
                  "opacity": 0.9,
                  "fillOpacity": 0.85
                }
              },
              "enabled": true
            },
            {
              "id": "underdark-underground-cover",
              "group": "Underdark",
              "label": "Underground Cover",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/udk_nat_underground_cover_pg.geojson",
              "role": "polygon",
              "order": 200,
              "styleByProperty": "feature_class",
              "style": {
                "color": "#315d48",
                "fillColor": "#4d8a68",
                "weight": 0.8,
                "opacity": 0.75,
                "fillOpacity": 0.28
              },
              "styles": {
                "Fungal Forest": {
                  "color": "#315d48",
                  "fillColor": "#4d8a68",
                  "weight": 0.8,
                  "opacity": 0.75,
                  "fillOpacity": 0.32
                }
              },
              "enabled": false
            },
            {
              "id": "underdark-domains",
              "group": "Underdark",
              "label": "Domains",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/udk_nat_domains_pg.geojson",
              "role": "polygon",
              "order": 205,
              "style": {
                "color": "#5d4a7d",
                "fillColor": "#7d6a9c",
                "weight": 1.25,
                "opacity": 0.9,
                "fillOpacity": 0.22
              },
              "enabled": false
            },
            {
              "id": "underdark-regions",
              "group": "Underdark",
              "label": "Named Regions",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/udk_con_named_regions_pg.geojson",
              "role": "polygon",
              "order": 207,
              "style": {
                "color": "#7b5c9f",
                "fillColor": "#a78ac2",
                "weight": 1.1,
                "opacity": 0.85,
                "fillOpacity": 0.18
              },
              "enabled": false
            },
            {
              "id": "underdark-lakes",
              "group": "Underdark",
              "label": "Lakes",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/udk_nat_lakes_pg.geojson",
              "role": "polygon",
              "order": 210,
              "style": {
                "color": "#386a91",
                "fillColor": "#5c9bc3",
                "weight": 0.9,
                "opacity": 0.8,
                "fillOpacity": 0.42
              },
              "enabled": false
            },
            {
              "id": "underdark-landforms",
              "group": "Underdark",
              "label": "Landforms",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/udk_nat_landforms_pg.geojson",
              "role": "polygon",
              "order": 212,
              "styleByProperty": "feature_class",
              "style": {
                "color": "#4c3c5f",
                "fillColor": "#68517f",
                "weight": 0.8,
                "opacity": 0.75,
                "fillOpacity": 0.22
              },
              "styles": {
                "Abyss": {
                  "color": "#241730",
                  "fillColor": "#3f2954",
                  "weight": 1,
                  "opacity": 0.8,
                  "fillOpacity": 0.28
                },
                "Cavern Network": {
                  "color": "#4c3c5f",
                  "fillColor": "#68517f",
                  "weight": 0.8,
                  "opacity": 0.75,
                  "fillOpacity": 0.24
                }
              },
              "enabled": false
            },
            {
              "id": "underdark-important-sites",
              "group": "Underdark",
              "label": "Important Sites",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/udk_civ_important_sites_pt.geojson",
              "role": "point",
              "order": 220,
              "radius": 4,
              "styleByProperty": "feature_class",
              "style": {
                "color": "#2b1d3c",
                "fillColor": "#d06fae",
                "weight": 1,
                "opacity": 0.95,
                "fillOpacity": 0.9
              },
              "styles": {
                "Ruins": {
                  "color": "#5f4234",
                  "fillColor": "#9d7863",
                  "weight": 1,
                  "opacity": 0.95,
                  "fillOpacity": 0.9
                },
                "Fortification": {
                  "color": "#4f2a1f",
                  "fillColor": "#c85d3c",
                  "weight": 1,
                  "opacity": 0.95,
                  "fillOpacity": 0.9
                },
                "Battlefield": {
                  "color": "#5b1f1f",
                  "fillColor": "#ba4d4d",
                  "weight": 1,
                  "opacity": 0.95,
                  "fillOpacity": 0.9
                },
                "Inn": {
                  "color": "#5a3818",
                  "fillColor": "#d9a14c",
                  "weight": 1,
                  "opacity": 0.95,
                  "fillOpacity": 0.9
                },
                "Cave": {
                  "color": "#2d2630",
                  "fillColor": "#6b5a70",
                  "weight": 1,
                  "opacity": 0.95,
                  "fillOpacity": 0.9
                },
                "Portal": {
                  "color": "#25265c",
                  "fillColor": "#7e8cff",
                  "weight": 1,
                  "opacity": 0.95,
                  "fillOpacity": 0.9
                }
              },
              "enabled": false
            },
            {
              "id": "underdark-landmarks",
              "group": "Underdark",
              "label": "Landmarks",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/udk_nat_landmarks_pt.geojson",
              "role": "point",
              "order": 222,
              "radius": 4,
              "style": {
                "color": "#3f1d17",
                "fillColor": "#d26a44",
                "weight": 1,
                "opacity": 0.95,
                "fillOpacity": 0.9
              },
              "enabled": false
            },
            {
              "id": "underdark-places",
              "group": "Underdark",
              "label": "Populated Places",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/udk_civ_populated_places_pt.geojson",
              "role": "point",
              "order": 225,
              "radius": 4,
              "styleByProperty": "feature_class",
              "style": {
                "color": "#2b1d3c",
                "fillColor": "#b88cd8",
                "weight": 1,
                "opacity": 0.95,
                "fillOpacity": 0.9
              },
              "styles": {
                "City": {
                  "color": "#4b2f18",
                  "fillColor": "#f2b84b",
                  "weight": 1.25,
                  "opacity": 0.95,
                  "fillOpacity": 0.95
                },
                "Town": {
                  "color": "#4b2f18",
                  "fillColor": "#f2d16b",
                  "weight": 1,
                  "opacity": 0.95,
                  "fillOpacity": 0.9
                },
                "Village": {
                  "color": "#4b2f18",
                  "fillColor": "#fff0a8",
                  "weight": 1,
                  "opacity": 0.9,
                  "fillOpacity": 0.85
                }
              },
              "enabled": false
            },
            {
              "id": "reference-graticule-fria",
              "group": "Reference",
              "label": "Graticule (FRIA)",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/glb_con_graticule_ln.geojson",
              "role": "line",
              "order": 235,
              "style": {
                "color": "#777777",
                "weight": 0.5,
                "opacity": 0.35,
                "dashArray": "2 6"
              },
              "enabled": false
            },
            {
              "id": "reference-graticule-md",
              "group": "Reference",
              "label": "Graticule (Myth Drannor)",
              "url": "modules/foundry-graph/assets/maps/toril-gis/geojson/glb_con_graticule_md_ln.geojson",
              "role": "line",
              "order": 240,
              "style": {
                "color": "#997777",
                "weight": 0.5,
                "opacity": 0.35,
                "dashArray": "2 6"
              },
              "enabled": false
            }
          ],
          "scaledScene": {
            "enabled": false
          },
          "walls": {
            "enabled": false
          }
        }
      }
    ],
    "icon": "modules/foundry-graph/img/icons/icon-geographical-map.webp",
    "renderer": "map",
    "color": "#4639f7",
    "nodeLabelColor": "#ffffff",
    "version": 1,
    "released": true,
    "editRelationsEnabled": false,
    "allowedEntities": ["Actor", "Scene", "Item", "JournalEntryPage"],
    "systems": ["*"],
    "relations": []
  },
  "enemy-map": {
    "id": "enemy-map",
    "name": "Enemy Map",
    "description": "Map of the enemies of the PCs",
    "background": {
      "image": "modules/foundry-graph/img/relations.webp",
      "width": 2500,
      "height": 1667
    },
    "themes": [],
    "icon": "modules/foundry-graph/img/icons/icon-enemy-map.webp",
    "renderer": "force",
    "color": "#550044",
    "nodeLabelColor": "#000000",
    "version": 1,
    "released": true,
    "editRelationsEnabled": true,
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
  "timeline-notes": {
    "id": "timeline-notes",
    "name": "Timeline",
    "description": "A lane-based timeline (lanes = relations) that stores time-bands linked to documents.",
    "themes": [],
    "background": {
      "image": "modules/foundry-graph/img/relations.webp",
      "width": 2500,
      "height": 1667
    },
    "icon": "modules/foundry-graph/img/icons/icon-timeline.webp",
    "renderer": "timeline",
    "color": "#01ff6b",
    "nodeLabelColor": "#ffffff",
    "version": 1,
    "released": false,
    "editRelationsEnabled": true,
    "systems": [
      "*"
    ],
    "allowedEntities": ["JournalEntryPage", "JournalEntry", "Actor", "Scene", "Item"]
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
    "themes": [{
      "id": "modern",
      "label": "Modern",
      "image": "modules/foundry-graph/img/themes/vamp-rel-chart/vampire-relation-chart.webp",
      "width": 2500,
      "height": 1667
    },
    {
      "id": "old",
      "label": "Old Style",
      "image": "modules/foundry-graph/img/themes/vamp-rel-chart/vampire-relation-chart-old.webp",
      "width": 1728,
      "height": 2464
    },
    ],
    "icon": "modules/foundry-graph/img/icons/icon-wod-relations.webp",
    "renderer": "force",
    "color": "#ff0000",
    "nodeLabelColor": "#ffffff",
    "version": 1,
    "released": true,
    "editRelationsEnabled": true,
    "allowedEntities": ["Actor", "JournalEntryPage"],
    "systems": [
      "vtm5e",
      "worldofdarkness",
      "wod5e",
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
        "noArrow": true,
        "strokeWidth": 2
      },
      {
        "id": "friends",
        "label": "Friends",
        "color": "#e377c2",
        "style": "dotted",
        "noArrow": true,
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
        "noArrow": true,
        "strokeWidth": 2
      },
      {
        "id": "associates",
        "label": "Associates with",
        "color": "#808000",
        "style": "solid",
        "noArrow": true,
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
        "noArrow": true,
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
    "themes": [],
    "icon": "modules/foundry-graph/img/icons/icon-faction-power.webp",
    "renderer": "force",
    "color": "#0000aa",
    "nodeLabelColor": "#000000",
    "version": 1,
    "released": true,
    "editRelationsEnabled": true,
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
        "noArrow": true,
        "strokeWidth": 1.5
      }
    ]
  },
  "cyber-network-map": {
    "id": "cyber-network-map",
    "name": "Cyber Network Map",
    "description": "A force graph for cyberpunk-style network diagrams using static symbols, glowing links, and optional Foundry documents.",
    "background": {
      "image": "modules/foundry-graph/img/matrix.webp",
      "width": 2500,
      "height": 1667
    },
    "themes": [],
    "icon": "modules/foundry-graph/img/icons/matrix.webp",
    "renderer": "force",
    "color": "#00d9ff",
    "nodeLabelColor": "#aefaff",
    "version": 1,
    "released": true,
    "editRelationsEnabled": true,
    "allowedEntities": ["Actor", "Scene", "Item", "JournalEntryPage"],
    "width": 1200,
    "height": 800,
    "systems": [
      "*"
    ],
    "symbols": [
      {
        "id": "host",
        "label": "Host",
        "img": "modules/foundry-graph/img/symbols/matrix/host.webp",
        "defaultName": "HOST",
        "size": 96
      },
      {
        "id": "camera",
        "label": "Camera",
        "img": "modules/foundry-graph/img/symbols/matrix/camera.webp",
        "defaultName": "CAM",
        "size": 84
      },
      {
        "id": "vault",
        "label": "Vault",
        "img": "modules/foundry-graph/img/symbols/matrix/vault.webp",
        "defaultName": "VAULT",
        "size": 84
      },
      {
        "id": "server",
        "label": "Server",
        "img": "modules/foundry-graph/img/symbols/matrix/server.webp",
        "defaultName": "SERVER",
        "size": 84
      },
      {
        "id": "database-enc",
        "label": "Database Encrypted",
        "img": "modules/foundry-graph/img/symbols/matrix/data-enc.webp",
        "defaultName": "DB ENC",
        "size": 84
      },
      {
        "id": "alert",
        "label": "Alert",
        "img": "modules/foundry-graph/img/symbols/matrix/alert.webp",
        "defaultName": "ALERT",
        "size": 84
      },
      {
        "id": "connection",
        "label": "Connection",
        "img": "modules/foundry-graph/img/symbols/matrix/connection.webp",
        "defaultName": "CONN",
        "size": 84
      },
      {
        "id": "lock",
        "label": "Lock",
        "img": "modules/foundry-graph/img/symbols/matrix/lock.webp",
        "defaultName": "LOCK",
        "size": 84
      },
      {
        "id": "tracker",
        "label": "Tracker",
        "img": "modules/foundry-graph/img/symbols/matrix/tracker.webp",
        "defaultName": "TRACKER",
        "size": 84
      },
      {
        "id": "smart-link",
        "label": "Smart Link",
        "img": "modules/foundry-graph/img/symbols/matrix/smart-link.webp",
        "defaultName": "SMART_LINK",
        "size": 84
      },
      {
        "id": "terminal",
        "label": "Terminal",
        "img": "modules/foundry-graph/img/symbols/matrix/terminal.webp",
        "defaultName": "TERMINAL",
        "size": 84
      },
      {
        "id": "death-ic",
        "label": "Death IC",
        "img": "modules/foundry-graph/img/symbols/matrix/death-ic.webp",
        "defaultName": "DEATH_IC",
        "size": 84
      }
    ],
    "relations": [
      {
        "id": "secure-link",
        "label": "Secure Link",
        "color": "#00eaff",
        "style": "solid",
        "strokeWidth": 2,
        "noArrow": false,
        "glow": true,
        "glowWidth": 8,
        "glowOpacity": 0.65
      },
      {
        "id": "compromised-link",
        "label": "Compromised Link",
        "color": "#ff5c2e",
        "style": "solid",
        "strokeWidth": 3,
        "noArrow": false,
        "glow": true,
        "glowWidth": 10,
        "glowOpacity": 0.75
      },
      {
        "id": "data-flow",
        "label": "Data Flow",
        "color": "#b56cff",
        "style": "dashed",
        "strokeWidth": 2,
        "noArrow": false,
        "glow": true,
        "glowWidth": 8,
        "glowOpacity": 0.55
      },
      {
        "id": "unknown-link",
        "label": "Unknown Link",
        "color": "#aaaaaa",
        "style": "dotted",
        "strokeWidth": 1.5,
        "noArrow": true,
        "glow": false
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
    "themes": [],
    "icon": "modules/foundry-graph/img/icons/icon-character-map.webp",
    "renderer": "force",
    "color": "#ffffff",
    "nodeLabelColor": "#000000",
    "version": 1,
    "released": true,
    "editRelationsEnabled": true,
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
        "noArrow": true,
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
        "noArrow": true,
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
    "themes": [],
    "icon": "modules/foundry-graph/img/icons/icon-genealogy-tree.webp",
    "renderer": "genealogy",
    "width": 1200,
    "height": 800,
    "color": "#226633",
    "nodeLabelColor": "#000000",
    "version": 1,
    "released": true,
    "editRelationsEnabled": false,
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
  },
  "wod-haven": {
    "id": "wod-haven",
    "name": "Haven Layout",
    "description": "A layout for displaying a vampire haven.",
    "background": {
      "image": "modules/foundry-graph/img/haven.webp",
      "width": 1728,
      "height": 2464
    },
    "themes": [
      {
        "id": "penthouse",
        "label": "Penthouse",
        "image": "modules/foundry-graph/img/themes/haven/penthouse.webp",
        "width": 1728,
        "height": 2464
      },
      {
        "id": "condo",
        "label": "Condo",
        "image": "modules/foundry-graph/img/themes/haven/condo.webp",
        "width": 1728,
        "height": 2464
      },
      {
        "id": "slums",
        "label": "Slums",
        "image": "modules/foundry-graph/img/themes/haven/slums.webp",
        "width": 1728,
        "height": 2464
      },
      {
        "id": "house",
        "label": "House",
        "image": "modules/foundry-graph/img/themes/haven/house.webp",
        "width": 1728,
        "height": 2464
      },
      {
        "id": "modern-house",
        "label": "Modern House",
        "image": "modules/foundry-graph/img/themes/haven/modern-house.webp",
        "width": 1728,
        "height": 2464
      },
      {
        "id": "manor",
        "label": "Manor",
        "image": "modules/foundry-graph/img/themes/haven/manor.webp",
        "width": 1728,
        "height": 2464
      },
      {
        "id": "castle",
        "label": "Castle",
        "image": "modules/foundry-graph/img/themes/haven/castle.webp",
        "width": 1728,
        "height": 2464
      },
      {
        "id": "medieval-manor",
        "label": "Medieval Manor",
        "image": "modules/foundry-graph/img/themes/haven/medieval-manor.webp",
        "width": 1728,
        "height": 2464
      },
      {
        "id": "medieval-village",
        "label": "Medieval Village",
        "image": "modules/foundry-graph/img/themes/haven/medieval-village.webp",
        "width": 1728,
        "height": 2464
      },
      {
        "id": "medieval-crypt",
        "label": "Medieval Crypt",
        "image": "modules/foundry-graph/img/themes/haven/medieval-crypt.webp",
        "width": 1728,
        "height": 2464
      }
    ],
    "icon": "modules/foundry-graph/img/icons/icon-haven-layout.webp",
    "renderer": "imageSlots",
    "width": 1200,
    "height": 800,
    "color": "#226633",
    "nodeLabelColor": "#000000",
    "version": 1,
    "released": true,
    "editRelationsEnabled": false,
    "allowedEntities": ["Item"],
    "systems": [
      "vtm5e",
      "worldofdarkness",
      "wod5e",
    ],
    "relations": [],
    "slots": [
      {
        "id": "hidden-armory",
        "label": "Hidden Armory",
        "x": 0.10,
        "y": 0.50,
        "w": 0.39,
        "h": 0.04,
        "maxNodes": 5,
        "slotFillColor": "#01310bff",
        "slotFillOpacity": 0.3,
        "slotBorderColor": "#888888",
        "slotBorderWidth": 2,
        "slotBorderStyle": "solid",
        "slotLabelColor": "#001805ff",
        "slotLabelFontSize": 14,
        "allowedEntityTypes": ["Item"],
        "allowedSubEntityTypes": ["feature"]
      },
      {
        "id": "watchmen",
        "label": "Watchmen",
        "x": 0.51,
        "y": 0.50,
        "w": 0.39,
        "h": 0.04,
        "maxNodes": 5,
        "slotFillColor": "#01310bff",
        "slotFillOpacity": 0.3,
        "slotBorderColor": "#888888",
        "slotBorderWidth": 2,
        "slotBorderStyle": "solid",
        "slotLabelColor": "#001805ff",
        "slotLabelFontSize": 18,
        "allowedEntityTypes": ["Item"],
        "allowedSubEntityTypes": ["feature",]
      },
      {
        "id": "cell",
        "label": "Cell",
        "x": 0.1,
        "y": 0.55,
        "w": 0.39,
        "h": 0.04,
        "maxNodes": 5,
        "slotFillColor": "#01310bff",
        "slotFillOpacity": 0.3,
        "slotBorderColor": "#888888",
        "slotBorderWidth": 2,
        "slotBorderStyle": "solid",
        "slotLabelColor": "#001805ff",
        "slotLabelFontSize": 18,
        "allowedEntityTypes": ["Item"],
        "allowedSubEntityTypes": ["feature",]
      },
      {
        "id": "laboratory",
        "label": "Laboratory",
        "x": 0.51,
        "y": 0.55,
        "w": 0.39,
        "h": 0.04,
        "maxNodes": 5,
        "slotFillColor": "#01310bff",
        "slotFillOpacity": 0.3,
        "slotBorderColor": "#888888",
        "slotBorderWidth": 2,
        "slotBorderStyle": "solid",
        "slotLabelColor": "#001805ff",
        "slotLabelFontSize": 18,
        "allowedEntityTypes": ["Item"],
        "allowedSubEntityTypes": ["feature",]
      },
      {
        "id": "library",
        "label": "Library",
        "x": 0.1,
        "y": 0.60,
        "w": 0.39,
        "h": 0.04,
        "maxNodes": 5,
        "slotFillColor": "#01310bff",
        "slotFillOpacity": 0.3,
        "slotBorderColor": "#888888",
        "slotBorderWidth": 2,
        "slotBorderStyle": "solid",
        "slotLabelColor": "#001805ff",
        "slotLabelFontSize": 18,
        "allowedEntityTypes": ["Item"],
        "allowedSubEntityTypes": ["feature",]
      },
      {
        "id": "location",
        "label": "Location",
        "x": 0.51,
        "y": 0.60,
        "w": 0.39,
        "h": 0.04,
        "maxNodes": 5,
        "slotFillColor": "#01310bff",
        "slotFillOpacity": 0.3,
        "slotBorderColor": "#888888",
        "slotBorderWidth": 2,
        "slotBorderStyle": "solid",
        "slotLabelColor": "#001805ff",
        "slotLabelFontSize": 18,
        "allowedEntityTypes": ["Item"],
        "allowedSubEntityTypes": ["feature",]
      },
      {
        "id": "luxury",
        "label": "Luxury",
        "x": 0.1,
        "y": 0.65,
        "w": 0.39,
        "h": 0.04,
        "maxNodes": 5,
        "slotFillColor": "#01310bff",
        "slotFillOpacity": 0.3,
        "slotBorderColor": "#888888",
        "slotBorderWidth": 2,
        "slotBorderStyle": "solid",
        "slotLabelColor": "#001805ff",
        "slotLabelFontSize": 18,
        "allowedEntityTypes": ["Item"],
        "allowedSubEntityTypes": ["feature",]
      },
      {
        "id": "postern",
        "label": "Postern",
        "x": 0.51,
        "y": 0.65,
        "w": 0.39,
        "h": 0.04,
        "maxNodes": 5,
        "slotFillColor": "#01310bff",
        "slotFillOpacity": 0.3,
        "slotBorderColor": "#888888",
        "slotBorderWidth": 2,
        "slotBorderStyle": "solid",
        "slotLabelColor": "#001805ff",
        "slotLabelFontSize": 18,
        "allowedEntityTypes": ["Item"],
        "allowedSubEntityTypes": ["feature",]
      },
      {
        "id": "security-system",
        "label": "Security System",
        "x": 0.1,
        "y": 0.70,
        "w": 0.39,
        "h": 0.04,
        "maxNodes": 5,
        "slotFillColor": "#01310bff",
        "slotFillOpacity": 0.3,
        "slotBorderColor": "#888888",
        "slotBorderWidth": 2,
        "slotBorderStyle": "solid",
        "slotLabelColor": "#001805ff",
        "slotLabelFontSize": 18,
        "allowedEntityTypes": ["Item"],
        "allowedSubEntityTypes": ["feature",]
      },
      {
        "id": "surgery",
        "label": "Surgery",
        "x": 0.51,
        "y": 0.70,
        "w": 0.39,
        "h": 0.04,
        "maxNodes": 5,
        "slotFillColor": "#01310bff",
        "slotFillOpacity": 0.3,
        "slotBorderColor": "#888888",
        "slotBorderWidth": 2,
        "slotBorderStyle": "solid",
        "slotLabelColor": "#001805ff",
        "slotLabelFontSize": 18,
        "allowedEntityTypes": ["Item"],
        "allowedSubEntityTypes": ["feature",]
      },
      {
        "id": "warding",
        "label": "Warding",
        "x": 0.1,
        "y": 0.75,
        "w": 0.39,
        "h": 0.04,
        "maxNodes": 5,
        "slotFillColor": "#01310bff",
        "slotFillOpacity": 0.3,
        "slotBorderColor": "#888888",
        "slotBorderWidth": 2,
        "slotBorderStyle": "solid",
        "slotLabelColor": "#001805ff",
        "slotLabelFontSize": 18,
        "allowedEntityTypes": ["Item"],
        "allowedSubEntityTypes": ["feature",]
      },
      {
        "id": "compromised",
        "label": "Compromised",
        "x": 0.51,
        "y": 0.75,
        "w": 0.39,
        "h": 0.04,
        "maxNodes": 1,
        "slotFillColor": "#2b0d01ff",
        "slotFillOpacity": 0.3,
        "slotBorderColor": "#991d1dff",
        "slotBorderWidth": 2,
        "slotBorderStyle": "solid",
        "slotLabelColor": "#f30b0bff",
        "slotLabelFontSize": 18,
        "allowedEntityTypes": ["Item"],
        "allowedSubEntityTypes": ["feature",]
      },
      {
        "id": "creepy",
        "label": "Creepy",
        "x": 0.1,
        "y": 0.80,
        "w": 0.39,
        "h": 0.04,
        "maxNodes": 1,
        "slotFillColor": "#2b0d01ff",
        "slotFillOpacity": 0.3,
        "slotBorderColor": "#991d1dff",
        "slotBorderWidth": 2,
        "slotBorderStyle": "solid",
        "slotLabelColor": "#f30b0bff",
        "slotLabelFontSize": 18,
        "allowedEntityTypes": ["Item"],
        "allowedSubEntityTypes": ["feature",]
      },
      {
        "id": "haunted",
        "label": "Haunted",
        "x": 0.51,
        "y": 0.80,
        "w": 0.39,
        "h": 0.04,
        "maxNodes": 5,
        "slotFillColor": "#2b0d01ff",
        "slotFillOpacity": 0.3,
        "slotBorderColor": "#991d1dff",
        "slotBorderWidth": 2,
        "slotBorderStyle": "solid",
        "slotLabelColor": "#f30b0bff",
        "slotLabelFontSize": 18,
        "allowedEntityTypes": ["Item"],
        "allowedSubEntityTypes": ["feature",]
      },
    ]
  },

  "fantasy-space-system": {
    "id": "fantasy-space-system",
    "name": "Fantasy Space System",
    "description": "A visual 3D fantasy space scene powered by Spacekit. Add stars, planets, moons and small bodies from the symbol palette and configure their texture and orbit in the dialog.",
    "themes": [
      {
        "id": "deep-space",
        "label": "Deep Space",
        "image": "modules/foundry-graph/assets/space/fantasy/textures/backgrounds/deep-space-01.png",
        "width": 1024,
        "height": 512,
        "spacekitBasePath": "modules/foundry-graph/assets/spacekit",
        "camera": {
          "initialPosition": [0, -22, 12]
        }
      }
    ],
    "background": {
      "image": "modules/foundry-graph/assets/space/fantasy/textures/backgrounds/deep-space-01.png",
      "width": 1024,
      "height": 512
    },
    "icon": "modules/foundry-graph/img/icons/space-system.webp",
    "renderer": "spacekit",
    "color": "#00eaff",
    "nodeLabelColor": "#ffffff",
    "version": 1,
    "released": true,
    "editRelationsEnabled": false,
    "systems": ["*"],
    "allowedEntities": [],
    "relations": [],
    "textureCatalog": {
      "star": [
        {
          "id": "yellow-star",
          "label": "Yellow Star",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/stars/sun.webp"
        },
        {
          "id": "red-star",
          "label": "Red Star",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/stars/red-giant.webp"
        },
        {
          "id": "blue-star",
          "label": "Blue Star",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/stars/blue-star.webp"
        },
        {
          "id": "dark-star",
          "label": "Dark Star",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/stars/dark-star.webp"
        }
      ],
      "planet": [
        {
          "id": "rocky-red",
          "label": "Rocky Red Planet",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/planets/red.webp"
        },
        {
          "id": "rocky-grey",
          "label": "Rocky Grey Planet",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/planets/mercury.webp"
        },
        {
          "id": "martian",
          "label": "Martian Planet",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/planets/mars.webp"
        },
        {
          "id": "semi-desert",
          "label": "Semi-Desert Planet",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/planets/desert.webp"
        },
        {
          "id": "desert",
          "label": "Desert Planet",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/planets/desert-02.webp"
        },
        {
          "id": "ocean",
          "label": "Ocean Planet",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/planets/neptune.webp"
        },
        {
          "id": "ice-rocky",
          "label": "Ice Rocky Planet",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/planets/haumea.webp"
        },
        {
          "id": "ice",
          "label": "Ice Planet",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/planets/ice.webp"
        },
        {
          "id": "lava",
          "label": "Lava Planet",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/planets/lava.webp"
        },
        {
          "id": "venusian",
          "label": "Venusian Planet",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/planets/venus.webp"
        },
        {
          "id": "toxic",
          "label": "Toxic Planet",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/planets/methane.webp"
        },
        {
          "id": "gas-giant",
          "label": "Gas Giant",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/planets/jupiter.webp"
        }
      ],
      "moon": [
        {
          "id": "gray-moon",
          "label": "Gray Moon",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/moons/moon.webp"
        }
      ],
      "smallBody": [
        {
          "id": "asteroid",
          "label": "Asteroid",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/asteroids/ceres.webp"
        },
        {
          "id": "comet-core",
          "label": "Comet Core",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/asteroids/comet.webp"
        },
        {
          "id": "crystal-body",
          "label": "Crystal Body",
          "texture": "modules/foundry-graph/assets/space/fantasy/textures/asteroids/crystal-body.webp"
        }
      ]
    },
    "symbols": [
      {
        "id": "star",
        "label": "Star",
        "defaultName": "Star",
        "bodyType": "star",
        "img": "modules/foundry-graph/assets/space/fantasy/icons/sun.webp",
        "radius": 2.8,
        "position": [0, 0, 0]
      },
      {
        "id": "planet",
        "label": "Planet",
        "defaultName": "Planet",
        "bodyType": "planet",
        "img": "modules/foundry-graph/assets/space/fantasy/icons/planet.webp",
        "radius": 0.75,
        "orbitRadius": 6,
        "orbitSpeed": 0.25
      },
      {
        "id": "moon",
        "label": "Moon",
        "defaultName": "Moon",
        "bodyType": "moon",
        "img": "modules/foundry-graph/assets/space/fantasy/icons/moon.webp",
        "radius": 0.32,
        "orbitRadius": 1.4,
        "orbitSpeed": 0.65,
        "orbitInclination": 8
      },
      {
        "id": "small-body",
        "label": "Small Body",
        "defaultName": "Small Body",
        "bodyType": "smallBody",
        "img": "modules/foundry-graph/assets/space/fantasy/icons/small-body.webp",
        "radius": 0.28,
        "orbitRadius": 4,
        "orbitSpeed": 0.45,
        "orbitInclination": 12
      }
    ]
  },
  "vis-timeline-notes": {
    "id": "vis-timeline-notes",
    "name": "Timeline",
    "description": "A lane-based timeline powered by vis.js. Items are linked to documents carrying start/end date flags. Supports drag-to-move, zoom, pan and custom calendar axis labels.",
    "themes": [],
    "background": {
      "image": "modules/foundry-graph/img/relations.webp",
      "width": 2500,
      "height": 1667
    },
    "icon": "modules/foundry-graph/img/icons/icon-vis-timeline.webp",
    "renderer": "vis-timeline",
    "color": "#01d4ff",
    "nodeLabelColor": "#ffffff",
    "version": 1,
    "released": true,
    "editRelationsEnabled": true,
    "systems": [
      "*"
    ],
    "allowedEntities": ["JournalEntryPage", "JournalEntry", "Actor", "Scene", "Item"],
    "relations": []
  }
}
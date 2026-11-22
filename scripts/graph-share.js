import { safeUUID, t, tf } from "./constants.js";

function connectedPlayers() {
  return game.users.contents.filter(user => user.active && !user.isGM);
}

export function canShareGraph(app) {
  return game.user?.role === foundry.CONST.USER_ROLES.GAMEMASTER &&
    app.api.canOpenById(app.graph.id) && typeof app.renderer?.exportToPNG === "function";
}

export async function shareGraphImage(app) {
  if (!canShareGraph(app)) return ui.notifications.warn(t("Notifications.GraphAccessDenied"));
  if (!connectedPlayers().length) return ui.notifications.warn(t("Notifications.NoConnectedPlayers"));

  const blob = await app.renderer.exportToPNG({ destination: "blob", forPlayers: true, scale: 2 });
  if (!(blob instanceof Blob) || !blob.size || blob.type !== "image/png") {
    throw new Error(t("Notifications.GraphShareFailed"));
  }

  const players = connectedPlayers();
  if (!players.length) return ui.notifications.warn(t("Notifications.NoConnectedPlayers"));
  const title = app.graph.name;
  const preview = URL.createObjectURL(blob);
  let selected;
  try {
    const content = document.createElement("div");
    const image = document.createElement("img");
    image.src = preview;
    image.alt = title;
    image.style.cssText = "display:block;width:100%;max-height:48vh;object-fit:contain;margin-bottom:0.75rem";
    await image.decode();
    content.append(image);

    const recipients = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = t("Dialogs.GraphShareRecipients");
    recipients.append(legend);
    const checkboxes = players.map(user => {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = user.id;
      input.checked = true;
      const label = document.createElement("label");
      label.style.display = "block";
      label.append(input, ` ${user.name}`);
      recipients.append(label);
      return input;
    });
    content.append(recipients);

    selected = await foundry.applications.api.DialogV2.wait({
      modal: true,
      rejectClose: false,
      window: { title: t("Dialogs.GraphSharePreview"), resizable: true },
      position: { width: 640 },
      content,
      buttons: [
        { action: "share", label: t("Buttons.ShowGraphToPlayers"), icon: "fa-solid fa-eye",
          callback: () => checkboxes.filter(input => input.checked).map(input => input.value) },
        { action: "cancel", label: t("Buttons.Cancel"), default: true }
      ]
    });
  } finally {
    URL.revokeObjectURL(preview);
  }

  if (!Array.isArray(selected)) return;
  if (!canShareGraph(app)) return ui.notifications.warn(t("Notifications.GraphAccessDenied"));
  const getActiveSelection = () => connectedPlayers().filter(user => selected.includes(user.id)).map(user => user.id);
  if (!getActiveSelection().length) return ui.notifications.warn(t("Notifications.NoGraphShareRecipients"));

  const image = await app.renderer.savePNGToDataFolder(blob, `graph-share-${safeUUID()}`, { subfolder: "graph-shares" });
  if (!image) throw new Error(t("Notifications.GraphShareFailed"));
  if (!canShareGraph(app)) return ui.notifications.warn(t("Notifications.GraphAccessDenied"));
  const users = getActiveSelection();
  if (!users.length) return ui.notifications.warn(t("Notifications.NoGraphShareRecipients"));

  const { ImagePopout } = foundry.applications.apps;
  const popout = new ImagePopout({ src: image, window: { title } });
  popout.shareImage({ image, title, users, showTitle: true });
  ui.notifications.info(tf("Notifications.GraphShared", { count: users.length }));
}

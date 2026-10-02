/*
 * Read the stored messages from the terminal, no server or admin UI needed:
 *
 *   npm run messages
 *   npm run messages -- --status new
 */
import { initStore } from "../src/store/fileStore.js";
import { countMessages, getMessages } from "../src/services/messageService.js";
import { MESSAGE_STATUSES, MessageStatus } from "../src/models/Message.js";

const args = process.argv.slice(2);
const statusArg = args.includes("--status") ? args[args.indexOf("--status") + 1] : undefined;
const status =
  statusArg && MESSAGE_STATUSES.includes(statusArg as MessageStatus)
    ? (statusArg as MessageStatus)
    : undefined;

function line(char = "-", width = 78) {
  return char.repeat(width);
}

async function main(): Promise<void> {
  initStore();
  const { items, total } = await getMessages({ status, limit: 50 });

  console.log(`\n${line("=")}`);
  console.log(`  ${total} message${total === 1 ? "" : "s"}${status ? ` with status "${status}"` : ""}`);
  console.log(line("="));

  if (items.length === 0) {
    console.log("\n  Nothing here yet.\n");
    return;
  }

  for (const msg of items) {
    console.log(`\n${line()}`);
    console.log(`  #${msg._id}`);
    console.log(`  ${msg.createdAt}   [${msg.status}]  emailed=${msg.emailSent}`);
    console.log(line());
    console.log(`  From:    ${msg.name} <${msg.email}>`);
    if (msg.company) console.log(`  Company: ${msg.company}`);
    console.log(`  Topic:   ${msg.topic}`);
    if (msg.source) console.log(`  Source:  ${msg.source}`);
    console.log(`  IP:      ${msg.ip || "n/a"}`);
    if (msg.emailError) console.log(`  Email:   ${msg.emailError}`);
    console.log(`\n${msg.message}\n`);
  }

  const all = await countMessages();
  console.log(line("="));
  console.log(`  showing ${items.length} of ${all}`);
  console.log(`${line("=")}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

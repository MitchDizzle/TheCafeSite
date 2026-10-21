// Test mode (KITCHEN_MOCK=1) and demo orders: made-up orders, and a
// stand-in for Square's catalog, so the board can be tried and the staff
// trained without touching Square.

// Demo mode (board Settings): practice orders for training, mixed in with
// the real ones, which keep showing. Practice tickets carry DEMO- ids, are
// marked DEMO on both screens, are never saved and never counted in the
// stats, and the demo turns itself off after DEMO_MINUTES.
const DEMO_PREFIX = "DEMO-";
const DEMO_MINUTES = 30;
const isDemo = (id) => String(id).startsWith(DEMO_PREFIX);

const mockItems = new Map(); // test mode's stand-in for Square's copy
const mockImages = new Map(); // test mode: item id -> data URL
// Test mode's stock counts: variation id -> how many are left.
const mockStock = new Map();
const mockStockStart = { "VAR-CC-Plain": 6, "VAR-CC-Pumpkin": 8 };
// Test mode's ids for what Square would number: new lists, options, images.
let mockNextId = 1;
const nextMockId = () => mockNextId++;

const mockStart = Date.now();
// A For Here order with one item to go, split the way the Restaurants POS
// is expected to record it (see lineToGo in toTicket).
function mockSplitOrder(created) {
  return {
    id: "MOCKSPLIT0010",
    state: "COMPLETED",
    created_at: created,
    ticket_name: "7",
    source: { name: "Square Point of Sale" },
    tenders: [{ id: "SPLT1234", type: "CARD" }],
    line_items: [
      { uid: "L1", quantity: "1", name: "Cheeseburger", variation_name: "Regular", modifiers: [{ name: "No onion" }] },
      { uid: "L2", quantity: "1", name: "Soup of the Day", variation_name: "Bowl" },
      { uid: "L3", quantity: "2", name: "Lunch Special", variation_name: "Meatloaf" },
    ],
    fulfillments: [
      { uid: "F1", type: "IN_STORE", state: "COMPLETED", line_item_application: "ENTRY_LIST", entries: [{ line_item_uid: "L1" }, { line_item_uid: "L2" }] },
      { uid: "F2", type: "PICKUP", state: "COMPLETED", line_item_application: "ENTRY_LIST", entries: [{ line_item_uid: "L3" }] },
    ],
  };
}

function mockOrders() {
  const ago = (min) => new Date(Date.now() - min * 6e4).toISOString();
  const at = (min) => new Date(mockStart + min * 6e4).toISOString();
  const li = (quantity, name, extra = {}) => ({ quantity: String(quantity), name, ...extra });
  const orders = [
    {
      id: "MOCKCOUNTER0001",
      state: "COMPLETED",
      created_at: at(-17),
      line_items: [
        li(1, "Turkey Club", { variation_name: "Sourdough", modifiers: [{ name: "No tomato" }] }),
        li(1, "Soup of the Day", { variation_name: "Bowl" }),
        li(1, "Iced Tea / Fountain Drink"),
      ],
    },
    {
      id: "MOCKPICKUP00002",
      state: "OPEN",
      created_at: ago(40),
      fulfillments: [
        {
          type: "PICKUP",
          state: "RESERVED",
          pickup_details: {
            pickup_at: at(12),
            recipient: { display_name: "Linda Parker" },
            note: "Will call when outside",
          },
        },
      ],
      line_items: [
        li(2, "Chicken Salad Croissant"),
        li(1, "Build Your Own", {
          variation_name: "Two meats",
          modifiers: [{ name: "Ham" }, { name: "Roast beef" }, { name: "Swiss" }, { name: "Wheat" }],
          note: "Mayo on the side",
        }),
        li(3, "Chocolate Chip Cookie"),
      ],
    },
    {
      id: "MOCKCOUNTER0003",
      state: "COMPLETED",
      created_at: at(-9),
      ticket_name: "Bob",
      fulfillments: [{ type: "PICKUP", state: "COMPLETED", pickup_details: { schedule_type: "ASAP" } }],
      line_items: [li(1, "Cheeseburger", { modifiers: [{ name: "Add bacon" }, { name: "No onion" }, { name: "Ketchup packet", quantity: "2" }] })],
    },
    {
      id: "MOCKCOUNTER0004",
      state: "COMPLETED",
      created_at: at(-2),
      ticket_name: "5",
      fulfillments: [{ type: "PICKUP", state: "COMPLETED", pickup_details: { schedule_type: "ASAP" } }],
      tenders: [{ id: "R7KQ2mXpLw", type: "CARD" }],
      line_items: [li(2, "Grilled Cheese"), li(2, "Kids Side", { variation_name: "Applesauce" })],
    },
    {
      id: "MOCKPICKUP00005",
      state: "OPEN",
      created_at: ago(300),
      fulfillments: [
        {
          type: "PICKUP",
          state: "RESERVED",
          pickup_details: { pickup_at: at(180), recipient: { display_name: "Catering — Hale" } },
        },
      ],
      line_items: [li(1, "Sandwich Tray", { variation_name: "Large" })],
    },
  ];
  // The Restaurants POS: a paid counter sale arrives with its fulfillment
  // already COMPLETED. It must stay on the board until Done.
  orders.push({
    id: "MOCKRESTPOS0006",
    state: "COMPLETED",
    created_at: at(-5),
    source: { name: "Square for Restaurants" },
    fulfillments: [{ type: "PICKUP", state: "COMPLETED", pickup_details: {} }],
    line_items: [li(1, "Philly Steak Sandwich")],
  });
  // Online, drinks and chips only: nothing to cook, but it still goes on
  // the kitchen board so the back sees it.
  orders.push({
    id: "MOCKONLINEDRNK8",
    state: "OPEN",
    created_at: at(-3),
    source: { name: "Square Online" },
    fulfillments: [{ type: "PICKUP", state: "PROPOSED", pickup_details: { pickup_at: at(15), recipient: { display_name: "Dee" } } }],
    line_items: [li(2, "Iced Tea / Fountain Drink"), li(1, "Chips", { variation_name: "BBQ" })],
  });
  // An online order the front already handed over: must NOT show.
  orders.push({
    id: "MOCKONLINEDONE7",
    state: "COMPLETED",
    created_at: at(-30),
    source: { name: "Square Online" },
    fulfillments: [{ type: "PICKUP", state: "COMPLETED", pickup_details: { pickup_at: at(-10) } }],
    line_items: [li(1, "Chef Salad")],
  });
  // A counter sale whose card payment was canceled on the terminal: OPEN,
  // nothing paid. Held on /front under "Not paid", never on the board.
  orders.push({
    id: "MOCKUNPAID00009",
    state: "OPEN",
    created_at: at(-4),
    ticket_name: "Tammy",
    source: { name: "Point of Sale" },
    net_amount_due_money: { amount: 1200, currency: "USD" },
    fulfillments: [{ type: "PICKUP", state: "PROPOSED", pickup_details: { schedule_type: "ASAP" } }],
    line_items: [li(1, "Breakfast Burrito")],
  });
  // A new counter order every 45 seconds, so the chime can be heard.
  const extra = Math.floor((Date.now() - mockStart) / 45000);
  for (let i = 0; i < Math.min(extra, 6); i++) {
    orders.push({
      id: `MOCKNEW${String(i).padStart(8, "0")}`,
      state: "COMPLETED",
      created_at: new Date(mockStart + (i + 1) * 45000).toISOString(),
      line_items: [li(1, ["Reuben", "BLT", "Patty Melt"][i % 3], { variation_name: "Rye" })],
    });
  }
  orders.push(mockSplitOrder(ago(3)));
  // As Square sends them since 2026-10-12: a Square Online pickup named
  // "Ordering Profile - Web", and a DoorDash delivery with its courier time.
  orders.push({
    id: "MOCKWEBORDER010",
    state: "OPEN",
    created_at: ago(6),
    source: { name: "Ordering Profile - Web" },
    fulfillments: [{ uid: "f1", type: "PICKUP", state: "PROPOSED", pickup_details: { pickup_at: at(10), schedule_type: "SCHEDULED", recipient: { display_name: "Pat" } } }],
    line_items: [li(1, "Breakfast Sandwich", { modifiers: [{ name: "Biscuit" }, { name: "Bacon" }] })],
  });
  orders.push({
    id: "MOCKDOORDASH011",
    state: "OPEN",
    created_at: ago(5),
    source: { name: "DoorDash" },
    ticket_name: "DoorDash",
    tenders: [{ id: "DDTENDER", type: "OTHER" }],
    fulfillments: [{ uid: "f1", type: "DELIVERY", state: "PROPOSED", delivery_details: { schedule_type: "ASAP", courier_pickup_at: at(8), courier_provider_name: "DoorDash", managed_delivery: true } }],
    line_items: [li(1, "Fried Potatoes"), li(1, "Biscuit & Gravy", { variation_name: "Full" })],
  });
  return orders;
}

// Test mode's stand-in for the Square catalog, by item name: enough to try
// skipping a whole category.
function mockCatalog() {
  const groups = {
    Drinks: ["Iced Tea / Fountain Drink", "Coffee", "Bottle Juice", "Bottle Water"],
    "Chips & Sweets": ["Chips", "Chocolate Chip Cookie"],
    Breakfast: ["Big Breakfast", "Breakfast Burrito", "Breakfast Sandwich"],
    Sandwiches: ["Turkey Club", "Reuben", "BLT", "Patty Melt", "Chicken Salad Croissant", "Build Your Own", "Grilled Cheese",
      "Cheeseburger", "Philly Steak Sandwich", "Clubhouse Wrap", "Reuben Sandwich", "BLT Sandwich", "Cordon Bleu Burger"],
    "Soups & Salads": ["Soup of the Day", "Chef Salad"],
    Kids: ["Kids Meal", "Kids Side"],
    Catering: ["Sandwich Tray"],
  };
  const out = [];
  for (const [name, items] of Object.entries(groups)) {
    const id = `CAT-${name}`;
    out.push({ type: "CATEGORY", id, category_data: { name } });
    for (const item of items) out.push({ type: "ITEM", id: `ITEM-${item}`, item_data: { name: item, categories: [{ id }] } });
  }
  // A Restaurants POS menu screen with a clashing name: must not show up
  // as a category to skip.
  out.push({ type: "CATEGORY", id: "MENU-Breakfast", category_data: { name: "Breakfast", category_type: "MENU_CATEGORY" } });
  // The daily items, shaped like Square's: Lunch Special priced at the till,
  // soup in two fixed sizes.
  const v = (id, name, price) => ({ id, type: "ITEM_VARIATION", item_variation_data: price == null
    ? { name, pricing_type: "VARIABLE_PRICING" } : { name, pricing_type: "FIXED_PRICING", price_money: { amount: price, currency: "USD" } } });
  const daily = [
    { type: "ITEM", id: "ITEM-Lunch Special", version: 1, item_data: { name: "Lunch Special", categories: [{ id: "CAT-Specials" }], variations: [v("VAR-LS", "Regular", null)] } },
    { type: "ITEM", id: "ITEM-Special Side", version: 1, item_data: { name: "Special Side", categories: [{ id: "CAT-Specials" }], variations: [v("VAR-SS", "Regular", 200)] } },
    { type: "ITEM", id: "ITEM-Soup of the Day", version: 1, item_data: { name: "Soup of the Day", categories: [{ id: "CAT-Soups & Salads" }], variations: [v("VAR-SC", "Cup", 500), v("VAR-SB", "Bowl", 700)] } },
  ];
  out.push({ type: "CATEGORY", id: "CAT-Specials", category_data: { name: "Lunch Specials" } });
  out.push({ type: "CATEGORY", id: "CAT-Desserts", category_data: { name: "Desserts" } });
  // Desserts as they are in Square since 2026-10-21: each kind is a
  // variation, counted in stock (mockStock) or not, and the cheesecake's
  // sauce is a list of its own.
  const kind = (id, name, ordinal, price) => {
    const o = v(id, name, price);
    Object.assign(o.item_variation_data, { ordinal, track_inventory: id in mockStockStart });
    return o;
  };
  const sauce = (id, name, ordinal) => ({ type: "MODIFIER", id, modifier_data: { name, ordinal, modifier_list_id: "LIST-Sauce" } });
  daily.push(
    { type: "ITEM", id: "ITEM-Cheesecake", version: 1, item_data: { name: "Cheesecake", categories: [{ id: "CAT-Desserts" }], channels: ["CH-POS"],
      variations: [kind("VAR-CC-Plain", "Plain", 0, 350), kind("VAR-CC-Pumpkin", "Pumpkin", 1, 350)],
      modifier_list_info: [{ modifier_list_id: "LIST-Sauce", enabled: true, min_selected_modifiers: 0, max_selected_modifiers: 1 }] } },
    { type: "ITEM", id: "ITEM-Dessert Bar", version: 1, item_data: { name: "Dessert Bar", categories: [{ id: "CAT-Desserts" }], channels: ["CH-POS", "CH-Online"],
      variations: [kind("VAR-DB-Magic", "Magic Bar", 0, 150), kind("VAR-DB-MM", "M&M Chocolate Rice Crispy Treat", 1, 150)] } },
    { type: "ITEM", id: "ITEM-Cream Puffs", version: 1, item_data: { name: "Cream Puffs", categories: [{ id: "CAT-Desserts" }], channels: ["CH-POS", "CH-Online"],
      variations: [v("VAR-CP", "Regular", 300)] } },
    { type: "MODIFIER_LIST", id: "LIST-Sauce", version: 1, modifier_list_data: { name: "Cheesecake Sauce", selection_type: "MULTIPLE",
      modifiers: [sauce("MOD-Caramel", "Caramel", 0), sauce("MOD-Chocolate", "Chocolate", 1)] } },
  );
  for (const [id, n] of Object.entries(mockStockStart)) if (!mockStock.has(id)) mockStock.set(id, n);
  for (const item of daily) {
    if (!mockItems.has(item.id)) mockItems.set(item.id, item);
    const i = out.findIndex((o) => o.id === item.id);
    if (i >= 0) out.splice(i, 1);
    out.push(mockItems.get(item.id));
  }
  // Items made from the front since (a new dessert).
  for (const o of mockItems.values()) if (o.type === "ITEM" && !out.some((x) => x.id === o.id)) out.push(o);
  return out;
}

// A lunch rush in miniature, from the real menu: counter tickets of
// different ages (so the colours show), online pickups, an allergy note,
// condiment packets and a drink for the front, then a new order every
// minute so the NEW tag, the edge flash and the chime can be shown.
function demoOrders(start) {
  const at = (min) => new Date(start + min * 6e4).toISOString();
  const li = (quantity, name, extra = {}) => ({ quantity: String(quantity), name, ...extra });
  const counter = (n, mins, name, items) => ({
    id: `${DEMO_PREFIX}COUNTER${n}`, state: "COMPLETED", created_at: at(mins), ticket_name: name, line_items: items,
  });
  const online = (n, mins, dueIn, name, items, note) => ({
    id: `${DEMO_PREFIX}ONLINE${n}`, state: "OPEN", created_at: at(mins), source: { name: "Square Online" },
    fulfillments: [{ type: "PICKUP", state: "RESERVED", pickup_details: { pickup_at: at(dueIn), recipient: { display_name: name }, note } }],
    line_items: items,
  });
  const orders = [
    counter(1, -16, "Linda", [li(1, "Big Breakfast", { modifiers: [{ name: "Scrambled" }, { name: "Bacon" }] }), li(1, "Coffee")]),
    counter(2, -9, "Ray", [li(1, "Clubhouse Wrap", { modifiers: [{ name: "No tomato" }] }), li(1, "Chips", { variation_name: "BBQ" })]),
    counter(3, -3, "Bob", [li(2, "Cheeseburger", { modifiers: [{ name: "No onion" }, { name: "Ketchup packet" }] })]),
    online(4, -25, 6, "Marge", [li(1, "Reuben Sandwich"), li(1, "Soup of the Day", { variation_name: "Cup" })], "Peanut allergy"),
    online(5, -5, 40, "Dee", [li(1, "Chef Salad", { variation_name: "Full", modifiers: [{ name: "Ranch" }] }), li(1, "Bottle Juice", { variation_name: "Apple" })]),
  ];
  const later = [
    ["Sue", [li(1, "Philly Steak Sandwich")]],
    ["Hank", [li(1, "Kids Meal", { modifiers: [{ name: "Chicken Strips" }, { name: "Mac & Cheese" }] }), li(1, "Grilled Cheese")]],
    ["Jo", [li(1, "BLT Sandwich", { modifiers: [{ name: "Mayo packet" }] }), li(1, "Iced Tea / Fountain Drink", { variation_name: "Iced Tea" })]],
    ["Al", [li(1, "Breakfast Sandwich", { modifiers: [{ name: "Sausage" }, { name: "Biscuit" }] })]],
    ["Pat", [li(1, "Cordon Bleu Burger", { variation_name: "Chicken", modifiers: [{ name: "Gluten-free bun" }] })]],
    ["Vic", [li(2, "Soup of the Day", { variation_name: "Bowl" })]],
  ];
  const arrived = Math.min(later.length, Math.floor((Date.now() - start) / 60000));
  for (let i = 0; i < arrived; i++) orders.push(counter(10 + i, i + 1, later[i][0], later[i][1]));
  return orders;
}

module.exports = { DEMO_PREFIX, DEMO_MINUTES, isDemo, mockItems, mockImages, mockStock, nextMockId, mockOrders, mockCatalog, demoOrders };

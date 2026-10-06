"""Build a Square catalog import CSV from src/_data/menu.json.

    npm run square                      → square/catalog-import.csv
    python scripts/square-catalog.py [template.csv] [out.csv]

Prices and descriptions come from menu.json so nothing is retyped. The layout
— which choices are variations, which item names read better in Square — is
decided here, in one place; square/README.md explains it and lists the
modifier lists that Square's import cannot carry.

The template is Square's own blank catalog export (square/template.csv). Its
five instruction/header rows are copied through verbatim.
"""
import csv, json, io, os, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MENU = os.path.join(REPO, "src", "_data", "menu.json")
TEMPLATE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, "square", "template.csv")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(REPO, "square", "catalog-import.csv")

menu = json.load(open(MENU, encoding="utf-8"))
cats = {c["id"]: c for c in menu["categories"]}

def item(cat_id, name):
    for i in cats[cat_id].get("items", []):
        if i["name"] == name:
            return i
    raise KeyError((cat_id, name))

rows = []

def add(name, category, variations, description="", skip_detail=None):
    """variations: list of (variation name, price)."""
    if skip_detail is None:
        # Straight to the ticket only when there is nothing to choose.
        skip_detail = len(variations) == 1
    for vname, price in variations:
        rows.append({
            "Item Name": name,
            "Customer-facing Name": name,
            "Variation Name": vname,
            "Description": description,
            "Categories": category,
            "Reporting Category": category,
            "Item Type": "Prepared food and beverage",
            "Price": f"{price:.2f}",
            "Archived": "N",
            "Sellable": "Y",
            "Contains Alcohol": "N",
            "Stockable": "N",
            "Skip Detail Screen in POS": "Y" if skip_detail else "N",
        })

def one(name, category, price, description="", skip_detail=None):
    add(name, category, [("Regular", price)], description, skip_detail)

# ── Breakfast ──────────────────────────────────────────────
B = "Breakfast"
fillings = cats["breakfast"]["note"]  # build-your-own filling list
add("Biscuit & Gravy", B, [("Full", item("breakfast", "Full Biscuit & Gravy")["price"]),
                           ("Half", item("breakfast", "Half Biscuit & Gravy")["price"])],
    "Served until 11am.")
i = item("breakfast", "Big Breakfast")
# Spelled out for Square rather than taken from menu.json's short line: eggs
# are cooked any style but poached (the Eggs modifier, client 2026-09-30), the
# meat is the Breakfast Meat modifier and the toast defaults to white. Square
# only — the printed menus keep "2 eggs, potatoes, meat & toast".
one("Big Breakfast", B, i["price"],
    "2 eggs your way, potatoes, choice of bacon, sausage or ham, and white toast. Served until 11am.",
    skip_detail=False)
one("Burrito", B, item("breakfast", "Burrito")["price"],
    "Build your own: bacon, sausage, ham, cheese, onion, tomato, jalapeno, potato, mushroom, olives. Served with sour cream or salsa. Served until 11am.",
    skip_detail=False)
om = item("breakfast", "2 / 3 Egg Omelet")
add("Omelet", B, [("2 Egg", om["prices"][0]), ("3 Egg", om["prices"][1])],
    "Build your own: bacon, sausage, ham, cheese, onion, tomato, jalapeno, potato, mushroom, olives. Served with sour cream or salsa. Served until 11am.")
i = item("breakfast", "Breakfast Sandwich")
one("Breakfast Sandwich", B, i["price"], i["description"] + " Served until 11am.", skip_detail=False)

# ── Breakfast sides ────────────────────────────────────────
BS = "Breakfast Sides"
add("Toast, Biscuit or English Muffin", BS,
    [(v, item("breakfast_sides", "Toast, Biscuit or English Muffin")["price"]) for v in ("Toast", "Biscuit", "English Muffin")])
for n, label in [("Bacon (4 slices)", "Bacon (4 slices)"), ("Sausage Patty", "Sausage Patty"),
                 ("Fried Potatoes", "Fried Potatoes"), ("Side of Gravy", "Side of Gravy")]:
    one(label, BS, item("breakfast_sides", n)["price"])

# ── Wraps (flat price from the category sizing line) ───────
W = "Wraps"
wrap_price = cats["wraps"]["sizing"][0]["price"]
for i in cats["wraps"]["items"]:
    desc = (i.get("description", "") + ". " if i.get("description") else "") + "On a flour (white) tortilla, or choose spinach or tomato wrap."
    one(i["name"], W, i.get("price", wrap_price), desc, skip_detail=False)

# ── Cold sandwiches ────────────────────────────────────────
C = "Cold Sandwiches"
for i in cats["sandwiches"]["items"]:
    # No description of its own ("Curry Chicken Salad Sandwich") → the filling
    # is the name, so say it: "Curry chicken salad on white bread".
    d = i.get("description") or i["name"].removesuffix(" Sandwich").lower()
    bread = i.get("defaultBread")
    if bread and "on " + bread.lower() not in d.lower():
        d += " on " + ("white bread" if bread == "White" else bread.lower())
    d = d[0].upper() + d[1:] + ". Choice of bread."
    one(i["name"], C, i["price"], d, skip_detail=False)

# ── Build your own ─────────────────────────────────────────
BYO = cats["build_sandwich"]
add("Build Your Own Sandwich", C, [(i["name"], i["price"]) for i in BYO["items"]],
    "Pick your meats (the curry chicken, walnut tuna and egg salads count as a meat), a cheese and a bread. " + BYO["note"])

# ── Hot sandwiches ─────────────────────────────────────────
H = "Hot Sandwiches"
kaiser = "On a Kaiser roll with lettuce, tomato, pickle & onion."
burger_names = {
    "Hamburger or Chicken": "Hamburger",
    "Cheeseburger or Chicken": "Cheeseburger",
    "Navajo Burger or Chicken": "Navajo Burger",
    "Bacon Cheese Burger or Chicken": "Bacon Cheese Burger",
    "Mushroom Swiss Burger or Chicken": "Mushroom Swiss Burger",
    "Cordon Bleu Burger or Chicken": "Cordon Bleu Burger",
    "Patty Melt or Chicken": "Patty Melt",
}
for i in cats["hot_sandwiches"]["items"]:
    if i["name"] in burger_names:
        d = i.get("description", "")
        if i["name"].startswith("Patty Melt"):
            d = d + "."  # already says "on rye"
        else:
            d = (d + ". " if d else "") + kaiser
        add(burger_names[i["name"]], H, [("Beef", i["price"]), ("Chicken", i["price"])], d)
    else:
        d = i.get("description", "")
        bread = i.get("defaultBread")
        if bread and bread.lower() not in d.lower():
            d = d + f" on {bread.lower()}"
        one(i["name"], H, i["price"], d + ". Choice of bread.", skip_detail=False)

# ── Salads ─────────────────────────────────────────────────
S = "Salads"
full, half = cats["salads"]["sizing"][0]["price"], cats["salads"]["sizing"][1]["price"]
for i in cats["salads"]["items"]:
    if "price" in i:
        one(i["name"], S, i["price"], i.get("description", "") + ".", skip_detail=False)
    else:
        add(i["name"], S, [("Full", full), ("Half", half)], i.get("description", "") + ".")

# ── Soup ───────────────────────────────────────────────────
add("Soup of the Day", "Soup", [(i["name"], i["price"]) for i in cats["soup"]["items"]], "Starting at 11am.")

# ── Kids ───────────────────────────────────────────────────
k = cats["kids"]
mains = ", ".join(k["picks"][0]["options"])
sides = ", ".join(k["picks"][1]["options"])
one("Kids Meal", "Kids Meals", k["sizing"][0]["price"],
    f"12 & under. One main ({mains}) and one side ({sides}).", skip_detail=False)

# ── Sides ──────────────────────────────────────────────────
SD = "Sides"
for i in cats["sides"]["items"]:
    if i["name"] == "Chips":
        add("Chips", SD, [(v.strip(), i["price"]) for v in i["description"].split(",")])
    else:
        one(i["name"], SD, i["price"])

# ── Drinks ─────────────────────────────────────────────────
D = "Drinks"
for i in cats["drinks"]["items"]:
    if i["name"] == "Iced Tea / Fountain Drink":
        # Fountain is self-serve Pepsi products, so no flavour list: the
        # variation only says which cup was sold.
        add("Iced Tea / Fountain Drink", D, [("Iced Tea", i["price"]), ("Fountain Drink", i["price"])],
            "Fountain drinks are self-serve Pepsi products.")
    elif i["name"] == "Bottle Juice":
        # One item; the flavour is the Juice modifier list in Square (made by
        # hand, see square/README.md), as the till was set up on 2026-10-05.
        one("Bottle Juice", D, i["price"], i.get("description", "") + ".")
    else:
        one(i["name"], D, i["price"])

# ── Desserts (sold all day) ────────────────────────────────
for i in cats["desserts"]["items"]:
    one(i["name"], "Desserts", i["price"], (i["description"] + ".") if i.get("description") else "")

# ── Write: template's five header lines verbatim, then rows ─
raw = open(TEMPLATE, encoding="utf-8", newline="").read()
lines = raw.splitlines(keepends=True)
header = next(csv.reader([lines[4]]))
# Square renamed "Skip Detail Screen in POS" to "Auto Add Item to Check"
# (seen in a library export, 2026-10-01). Same Y/N meaning: ring the item
# straight onto the ticket without opening its options. Write the value
# under whichever name this template uses.
if "Auto Add Item to Check" in header:
    for r in rows:
        r["Auto Add Item to Check"] = r.pop("Skip Detail Screen in POS")
buf = io.StringIO()
w = csv.DictWriter(buf, fieldnames=header, lineterminator="\n", extrasaction="raise")
for r in rows:
    w.writerow({h: r.get(h, "") for h in header})
with open(OUT, "w", encoding="utf-8", newline="") as f:
    f.write("".join(lines[:5]))
    if not lines[4].endswith("\n"):
        f.write("\n")
    f.write(buf.getvalue())

items = []
for r in rows:
    if r["Item Name"] not in items:
        items.append(r["Item Name"])
print(f"{len(items)} items, {len(rows)} rows -> {OUT}")

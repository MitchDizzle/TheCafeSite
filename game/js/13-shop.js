  /* Late in the week the items that only earn turn up less (owner
     2026-11-13: by then the player is after getting through). */
  function weighted(pool, shop) {
    var late = shop && G.day >= D.lateShop.fromDay, w = pool.map(function (it) { return late && it.kind === 'tips' ? D.lateShop.tips : 1; });
    var sum = w.reduce(function (a, b) { return a + b; }, 0), x = rand() * sum;
    for (var i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }
  function deal(n, not, shop) {
    var odds = D.odds[Math.min(G.day, D.odds.length - 1)], out = [];
    var falls = { epic: ['epic', 'rare', 'normal'], rare: ['rare', 'normal', 'epic'], normal: ['normal', 'rare', 'epic'] };
    for (var k = 0; k < n; k++) {
      var roll = rand() * 100, rar = roll < odds.epic ? 'epic' : roll < odds.epic + odds.rare ? 'rare' : 'normal', got = null;
      for (var f = 0; f < 3 && !got; f++) {
        var pool = D.items.filter(function (it) { return it.rarity === falls[rar][f] && has(it.id) < (it.max || 1) && out.indexOf(it) === -1 && not.indexOf(it.id) === -1 && !(it.id === 'spatula' && level().flip === 'none') && !(it.id === 'smalltalk' && !level().family) && !(it.id === 'horseshoe' && !level().trouble) && !locked(it.id); });
        if (pool.length) got = weighted(pool, shop);
      }
      if (got) out.push(got);
    }
    return out;
  }
  /* An item's number, for k of it owned (game.json: per, base, unit), and its
     text with that number highlighted (owner 2026-11-12: "20%", and more
     with each one). */
  function itemPer(id) { var it = D.items.filter(function (x) { return x.id === id; })[0]; return it ? it.per : 0; }
  function numText(it, k) {
    var n = (it.base || 0) + it.per * k;
    return it.unit === '%' ? n + '%' : it.unit === '$' ? money(n) : it.unit === 's' ? plural(n, 'second', 'seconds')
      : it.unit === 'times' ? (n === 1 ? 'Once' : n === 2 ? 'Twice' : n + ' times') : String(n);
  }
  function itemText(it, k) {
    if (it.per == null || it.text.indexOf('{n}') === -1) return esc(it.text);
    var bits = it.text.split('{n}');
    return esc(bits[0]) + '<b class="ou-num">' + esc(numText(it, k)) + '</b>' + esc(bits.slice(1).join(''));
  }
  function itemCard(it, act, i, extra) {
    var pips = '<i></i>'.repeat({ normal: 1, rare: 2, epic: 3, legendary: 4 }[it.rarity] || 1);
    return '<button class="ou-card is-' + it.rarity + (extra.cls || '') + '" data-act="' + act + '" data-i="' + i + '">' +
      '<span class="ou-rar">' + pips + D.rarityNames[it.rarity] + '</span>' +
      '<span class="ou-ci ou-sh">' + spr(it.icon) + '</span>' +
      '<span><b>' + esc(it.name) + '</b><span class="ou-ct">' + itemText(it, has(it.id) + (extra.sold ? 0 : 1)) + '</span>' +
      (has(it.id) ? '<span class="ou-own">You have ' + has(it.id) + (it.per != null && !extra.sold ? ' · now ' + numText(it, has(it.id)).toLowerCase() : '') + '</span>' : '') + '</span>' +
      (extra.price ? '<span class="ou-price' + (extra.was ? ' is-sale' : '') + '">' + (extra.was ? '<s>' + extra.was + '</s>' : '') + extra.price + '</span>' : '<span></span>') + '</button>';
  }

  function showClose() {
    // What was earned since the last close (all of the week's are listed again at the end).
    G.tonightAch = G.newAch.slice(G.achShown || 0); G.achShown = G.newAch.length;
    G.stage = 'pick'; G.pick = deal(3, [], false); G.shop = []; G.sold = []; G.reroll = D.reroll.first; G.sale = false;
    drawClose();
  }
  /* What turning down the free item pays tonight (owner 2026-11-12): more
     later in the week, when an item has fewer days left to pay off. */
  function skipBonus() { var b = D.skip.bonus; return b[Math.min(G.day, b.length - 1)]; }
  /* From the shop to the shop's stock. A week that has bought nothing by
     Wednesday's close may find the shop on sale (owner 2026-11-12: by
     Thursday an item has little time left to pay for itself). Decided once
     a close, kept through a restock. */
  function toShop() {
    G.stage = 'shop'; G.shop = deal(3, [], true); G.fryer = rand() * 100 < (D.legendaryChance || 0);
    G.sale = G.day >= D.sale.fromDay && !G.bought && rand() * 100 < D.sale.chance;
    drawClose();
  }
  /* The shop's price tonight: the careful week's sale, or Thursday's half
     price (owner 2026-11-13: an item bought then has only Friday left), the
     bigger of the two. Never the Deep Fryer. */
  function offTonight() { return Math.max(G.sale ? D.sale.off : 0, G.day === D.lastShop.day ? D.lastShop.off : 0); }
  function priceOf(it) {
    var off = offTonight();
    if (!off || it.rarity === 'legendary') return it.price;
    return Math.max(5, Math.round(it.price * (100 - off) / 500) * 5);
  }
  function drawClose() {
    var day = D.days[G.day], next = D.days[G.day + 1], body, foot = '', after = '';
    if (G.stage === 'pick') {
      body = (T.clean ? '<p class="ou-clean"><b>Flawless day: +' + money(T.clean) + '.</b> No walk-outs, nothing burnt.</p>' : '') +
        '<span class="ou-label">Pick one, free</span>' + G.pick.map(function (it, i) { return itemCard(it, 'pick', i, {}); }).join('');
      // Achievements earned today go under everything to do with tonight's
      // pick (owner 2026-11-13: nobody should scroll past them to play on).
      if (G.tonightAch.length) after = '<span class="ou-label">New achievements</span>' + achList(G.tonightAch);
      foot = '<div class="ou-foot"><button class="ou-btn ou-btn--quiet" data-act="skip">None tonight · ' + money(skipBonus()) + ' in tips instead</button></div>';
    } else {
      // Restock sits beside the shop's name, so the foot is one big button (owner 2026-11-13).
      body = '<div class="ou-shophead"><span class="ou-label">The shop</span>' +
        '<button class="ou-restock" data-act="reroll"' + (G.tips < G.reroll ? ' disabled' : '') + ' aria-label="Restock the shop for ' + money(G.reroll) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        money(G.reroll) + '</button></div>' +
        (G.sale && offTonight() === D.sale.off ? '<p class="ou-sale"><b>' + D.sale.off + '% off tonight.</b> You haven’t bought a thing all week, so the supplier cut you a deal.</p>'
          : G.day === D.lastShop.day ? '<p class="ou-sale"><b>Half price tonight.</b> One day left: everything’s ' + D.lastShop.off + '% off.</p>' : '') +
        G.shop.map(function (it, i) {
        var sold = G.sold.indexOf(i) !== -1, cost = priceOf(it), poor = !sold && G.tips < cost;
        return itemCard(it, 'buy', i, { sold: sold, price: sold ? 'Yours' : money(cost), was: !sold && cost !== it.price ? money(it.price) : '', cls: sold ? ' is-sold' : poor ? ' is-poor' : '' });
      }).join('') +
        // The one thing that is never for sale: there is no fryer (see /feedback).
        (G.fryer && fryerItem() && !has('fryer') ? itemCard(fryerItem(), 'fryer', 0, { price: money(fryerItem().price), cls: G.tips < fryerItem().price ? ' is-poor' : '' }) : '') +
        '';
      foot = '<div class="ou-foot"><button class="ou-btn" data-act="next">Open ' + next.name + '</button></div>';
    }
    paper('close',
      '<div class="ou-top ou-top--wallet"><span class="ou-kicker">' + day.name + ' results</span><h2 class="ou-h">' + money(T.tips) + ' in tips</h2>' +
      '<span class="ou-label">' + plural(T.served, 'plate', 'plates') + ' · ' + plural(T.walk, 'walk-out', 'walk-outs') + '</span>' +
      '<div class="ou-wallet"><span class="ou-label">To spend</span><b>' + money(G.tips) + '</b></div></div>' +
      '<div class="ou-body-pad">' + body + ownedRow() + after + '</div>' + foot);
    keepRun('close');      // every change after close is kept at once
  }
  /* Tips in the game are points (owner 2026-11-12): said on How to play and
     under every finished week, so nobody reads them as the café's money. */
  var TIPS_NOTE = 'Tips in the game are points, not money. At The Café, real tips go to the cooks and the people who work there.';
  /* The week day by day: [tips, plates, walk-outs] for each day played. */
  function weekDays() {
    var out = [];
    for (var d = 0; d <= G.day; d++) {
      var l = (G.log && G.log[d]) || null;
      out.push(l ? l : [G.perDay[d] == null ? (T && d === G.day ? T.tips : 0) : G.perDay[d], d === G.day && T ? T.served : '', d === G.day && T ? T.walk : '']);
    }
    return out;
  }
  function own(it) { G.items[it.id] = (G.items[it.id] || 0) + 1; }

  /* What each item's count means (owner 2026-11-13: how long it was had, and
     what it brought in or saved). Tips items show the tips; the rest their
     count. */
  var ITEM_DID = {
    press: ['second of cooking saved', 'seconds of cooking saved'], shelf: ['food kept from burning', 'foods kept from burning'],
    bell: ['ticket saved', 'tickets saved'], clamshell: ['to-go ticket saved', 'to-go tickets saved'], refills: ['ticket saved', 'tickets saved'],
    board: ['ticket saved', 'tickets saved'], scraper: ['burnt food cleared', 'burnt foods cleared'], flattop: ['food on the new spots', 'foods on the new spots'],
    urn: ['coffee poured again', 'coffees poured again'], bottomless: ['coffee poured again', 'coffees poured again'],
    counter: ['plate sent', 'plates sent'], linecook: ['ticket saved', 'tickets saved'], cookie: ['clock started over', 'clocks started over'],
    spatula: ['flip', 'flips'], spare: ['plate swap', 'plate swaps'], smalltalk: ['line answered', 'lines answered'],
    horseshoe: ['trouble kept away', 'troubles kept away'], goldspat: ['food kept from burning', 'foods kept from burning'],
    bigdill: ['plate finished by a pickle', 'plates finished by a pickle'], penny: ['lucky plate', 'lucky plates'], regular: ['usual', 'usuals'],
    rollcase: ['cinnamon roll', 'cinnamon rolls'], puffcase: ['cream puff', 'cream puffs'], fbpost: ['extra special', 'extra specials']
  };
  function didText(id, s) {
    var n = Math.round(s.n), words = ITEM_DID[id], out = [];
    if (s.tips >= 0.5) out.push('+' + money(Math.round(s.tips)) + ' in tips');
    if (words && (n || !out.length)) out.push(n + ' ' + (n === 1 ? words[0] : words[1]));
    return out.join(' · ') || 'nothing yet';
  }
  function itemTable(stats) {
    var list = D.items.filter(function (it) { return stats[it.id]; });
    if (!list.length) return '';
    return '<span class="ou-label">Your line this week</span><div class="ou-istats">' + list.map(function (it) {
      var s = stats[it.id];
      return '<div class="is-' + it.rarity + '">' + spr(it.icon) + '<b>' + esc(it.name) + '</b>' +
        '<span>' + plural(s.d, 'day', 'days') + (s.paid ? ' · paid ' + money(s.paid) : ' · free') + '</span>' +
        '<strong>' + didText(it.id, s) + '</strong></div>';
    }).join('') + '</div>';
  }
  /* The Deep Fryer (Legendary, owner 2026-11-12): a real item with real
     stats, priced past anything a week pays. It's never dealt by the odds;
     it turns up by itself in about one shop in three. */
  function fryerItem() { return D.items.filter(function (it) { return it.id === 'fryer'; })[0]; }


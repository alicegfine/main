import Link from "next/link";

interface MenuLink {
  url: string;
  label: string;
}

interface Restaurant {
  name: string;
  category: string;
  distance: string;
  gf: string;
  vegn: string;
  reservations: string;
  maps: string;
  menuLinks: MenuLink[];
  description: string;
}

const RESTAURANTS: Restaurant[] = [
  {
    name: "Schwartz's Deli",
    category: "Classic Montreal",
    distance: "Transit or cab (about 15 minutes)",
    gf: "No",
    vegn: "No",
    reservations: "None taken",
    maps: "https://www.google.com/maps/dir/?api=1&origin=H%C3%B4tel+Monville,+1041+Rue+De+Bleury,+Montreal&destination=Schwartz%27s+Deli,+3895+Boulevard+Saint-Laurent,+Montreal&hl=en",
    menuLinks: [{ url: "https://schwartzsdeli.com/pages/menu", label: "Menu" }],
    description:
      "Iconic smoked meat deli on the Main, open since 1928. First on every list of classic Montreal restaurants.",
  },
  {
    name: "Holder",
    category: "Classic Montreal",
    distance: "10-min walk",
    gf: "Yes (GF menu + fryer)",
    vegn: "Limited",
    reservations: "Recommended for 6–8",
    maps: "https://www.google.com/maps/dir/?api=1&origin=H%C3%B4tel+Monville,+1041+Rue+De+Bleury,+Montreal&destination=Holder,+407+Rue+McGill,+Montreal&hl=en",
    menuLinks: [{ url: "https://restaurantholder.com/en/a-la-carte/", label: "Menu" }],
    description:
      "Classic Montreal bistro in Old Montreal. Does have a vegan option and a vegetarian option, but tough on protein. Has a gluten-free menu.",
  },
  {
    name: "Poutineville Bishop",
    category: "Classic Montreal",
    distance: "Transit or cab (about 14 minutes), or a 25-min walk",
    gf: "Limited",
    vegn: "Limited",
    reservations: "None taken",
    maps: "https://google.com/maps/dir/Hôtel+Monville,+1041+Rue+de+Bleury,+Montreal,+Quebec+H2Z+0A3,+Canada/Poutineville+Bishop,+1228+R.+Bishop,+Montreal,+Quebec+H3G+2E3,+Canada",
    menuLinks: [
      { url: "https://poutineville.com/en/menu/montreal/", label: "Menu" },
      { url: "https://poutineville.com/en/faq-frequently-asked-questions/", label: "Dietary info" },
    ],
    description:
      "Casual build-your-own poutine spot with 40+ ingredients and classic varieties. Has dedicated vegan/GF options.",
  },
  {
    name: "Ma Poule Mouillée",
    category: "Classic Montreal",
    distance: "Transit or cab (about 20 minutes)",
    gf: "Limited",
    vegn: "Limited",
    reservations: "None taken",
    maps: "https://www.google.com/maps/dir/?api=1&origin=H%C3%B4tel+Monville,+1041+Rue+De+Bleury,+Montreal&destination=Ma+Poule+Mouill%C3%A9e,+969+Rue+Rachel+E,+Montreal&hl=en",
    menuLinks: [{ url: "https://mapoulemouillee.menu-res.com/menu", label: "Menu (may not be up to date)" }],
    description:
      "Portuguese chicken restaurant that happens to have very highly recommended poutine.",
  },
  {
    name: "Lola Rosa Place-des-Arts",
    category: "Vegan/vegetarian",
    distance: "8-min walk",
    gf: "Several GF",
    vegn: "100% vegan",
    reservations: "Recommended",
    maps: "https://www.google.com/maps/dir/?api=1&origin=H%C3%B4tel+Monville,+1041+Rue+De+Bleury,+Montreal&destination=Lola+Rosa,+276+Rue+Sainte-Catherine+Ouest,+Montreal&hl=en",
    menuLinks: [{ url: "https://lola-rosa.ca/wp-content/uploads/menu/PDA%20MENU%20COMPLET.pdf?_t=1760561927", label: "Menu" }],
    description: "100% vegan, comfort food, casual. Several GF options.",
  },
  {
    name: "Bloom Sushi",
    category: "Vegan/vegetarian",
    distance: "8-min walk",
    gf: "Some GF",
    vegn: "100% vegan",
    reservations: "Required for 6+",
    maps: "https://www.google.com/maps/dir/?api=1&origin=H%C3%B4tel+Monville,+1041+Rue+De+Bleury,+Montreal&destination=Bloom+Sushi,+288+Rue+Sainte-Catherine+Ouest,+Montreal&hl=en",
    menuLinks: [{ url: "https://bloomsushi.com/en/restaurants/bloom-sushi-quartier-des-spectacles/", label: "Menu" }],
    description:
      "100% vegan sushi. Recommend making a reservation. GF options.",
  },
  {
    name: "Resto Végo",
    category: "Vegan/vegetarian",
    distance: "Transit or cab (about 13 minutes), or a 24-min walk",
    gf: "Extensive (labeled)",
    vegn: "100% vegetarian",
    reservations: "None taken",
    maps: "https://www.google.com/maps/dir/?api=1&origin=H%C3%B4tel+Monville,+1041+Rue+De+Bleury,+Montreal&destination=Resto+V%C3%A9go,+1720+Rue+Saint-Denis,+Montreal&hl=en",
    menuLinks: [
      { url: "https://restovego.ca/en/buffet/", label: "Buffet menu" },
      { url: "https://restovego.ca/en/gourmet-counter/", label: "Gourmet counter" },
    ],
    description:
      "Enormous pay-by-weight vegetarian buffet, ~200 different dishes.",
  },
  {
    name: "Arepera",
    category: "Veg/omni",
    distance: "Transit or cab (about 15 minutes), or a 26-min walk",
    gf: "100% GF",
    vegn: "Vegan + veg options",
    reservations: "Recommended",
    maps: "https://www.google.com/maps/dir/?api=1&origin=H%C3%B4tel+Monville,+1041+Rue+De+Bleury,+Montreal&destination=Arepera,+Montreal&hl=en",
    menuLinks: [{ url: "https://www.arepera.ca/general-4", label: "Menu" }],
    description:
      "100% GF; vegan, vegetarian, and omnivore options. Casual and very well-reviewed arepa restaurant.",
  },
  {
    name: "Qing Hua Dumpling",
    category: "Veg/omni",
    distance: "7-min walk",
    gf: "No",
    vegn: "Veg options",
    reservations: "None taken",
    maps: "https://www.google.com/maps/dir/?api=1&origin=H%C3%B4tel+Monville,+1041+Rue+De+Bleury,+Montreal&destination=Qing+Hua+Dumpling,+1019+Boulevard+Saint-Laurent,+Montreal&hl=en",
    menuLinks: [{ url: "https://www.qinghuadumpling.com/menu", label: "Menu" }],
    description:
      "Chinatown dumpling spot with dozens of jiaozi varieties, including plentiful vegetarian options.",
  },
  {
    name: "Jacopo",
    category: "Miscellaneous",
    distance: "16-min walk",
    gf: "Some GF pasta",
    vegn: "Veg options",
    reservations: "Recommended",
    maps: "https://www.google.com/maps/dir/?api=1&origin=H%C3%B4tel+Monville,+1041+Rue+De+Bleury,+Montreal&destination=Jacopo,+436+Place+Jacques-Cartier,+Montreal&hl=en",
    menuLinks: [{ url: "https://jacopomtl.com/en/menus/a-la-carte/", label: "Menu" }],
    description:
      "Stylish modern Italian bistro. Handmade pastas, wood-fired pizzas, natural wine list.",
  },
  {
    name: "Maggie Oakes",
    category: "Miscellaneous",
    distance: "17-min walk",
    gf: "Yes",
    vegn: "Vegan + veg options",
    reservations: "Strongly recommended",
    maps: "https://www.google.com/maps/dir/?api=1&origin=H%C3%B4tel+Monville,+1041+Rue+De+Bleury,+Montreal&destination=Maggie+Oakes,+426+Place+Jacques-Cartier,+Montreal&hl=en",
    menuLinks: [{ url: "https://maggieoakes.com/en/#ourmenus", label: "Menu" }],
    description:
      "Modern steakhouse in Old Montreal with explicit vegetarian, vegan, and GF group accommodation.",
  },
  {
    name: "Tiradito",
    category: "Miscellaneous",
    distance: "1-min walk (across street)",
    gf: "Good (raw fish)",
    vegn: "Limited",
    reservations: "Recommended for 6–8",
    maps: "https://www.google.com/maps/dir/?api=1&origin=H%C3%B4tel+Monville,+1041+Rue+De+Bleury,+Montreal&destination=Tiradito,+1076+Rue+De+Bleury,+Montreal&hl=en",
    menuLinks: [{ url: "https://www.tiraditomtl.com/english/menu/?lang=en#menu", label: "Menu" }],
    description:
      "Peruvian/Nikkei across the street from the hotel. Ceviche, tiradito, anticuchos.",
  },
  {
    name: "Stash Café",
    category: "Miscellaneous",
    distance: "10-min walk",
    gf: "Limited",
    vegn: "Limited",
    reservations: "Recommended",
    maps: "https://www.google.com/maps/dir/?api=1&origin=H%C3%B4tel+Monville,+1041+Rue+De+Bleury,+Montreal&destination=Stash+Caf%C3%A9,+200+Rue+Saint-Paul+Ouest,+Montreal&hl=en",
    menuLinks: [{ url: "https://restaurantstashcafe.ca/en/home-english/#menu", label: "Menu" }],
    description:
      "Polish institution in Old Montreal since 1972. Pierogi, bigos, kielbasa, schnitzel.",
  },
  {
    name: "Monème",
    category: "Miscellaneous",
    distance: "In the hotel",
    gf: "Limited",
    vegn: "Limited",
    reservations: "Recommended",
    maps: "",
    menuLinks: [{ url: "https://www.hotelmonville.com/wp-content/uploads/2026/04/SOUPER-Menu-MONEME.docx-7.pdf", label: "Menu" }],
    description:
      "The hotel restaurant! Genuinely very well-reviewed, has vegan and GF options but is meat-heavy.",
  },
];

const CATEGORY_ORDER = [
  "Classic Montreal",
  "Vegan/vegetarian",
  "Veg/omni",
  "Miscellaneous",
];

function RestaurantCard({ r }: { r: Restaurant }) {
  const attributes: [string, string][] = [
    ["Distance", r.distance],
    ["GF", r.gf],
    ["Veg*n", r.vegn],
    ["Reservations", r.reservations],
  ];

  return (
    <div className="card p-5">
      <h3 className="text-lg font-bold text-navy-900 mb-1">{r.name}</h3>
      <p className="text-slate-600 text-sm leading-relaxed mb-4">{r.description}</p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm mb-4">
        {attributes.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-400 font-medium">{label}</dt>
            <dd className="text-slate-700">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap gap-3 text-sm">
        {r.maps && (
          <a
            href={r.maps}
            target="_blank"
            rel="noopener noreferrer"
            className="text-navy-600 hover:text-navy-800 font-medium inline-flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Directions
          </a>
        )}
        {r.menuLinks.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-navy-600 hover:text-navy-800 font-medium inline-flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}

export default function RestaurantsPage() {
  const byCategory = new Map<string, Restaurant[]>();
  for (const r of RESTAURANTS) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  }
  const categories = CATEGORY_ORDER.filter((c) => byCategory.has(c));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/logistics"
        className="text-navy-600 hover:text-navy-800 text-sm font-medium inline-flex items-center gap-1 mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Logistics
      </Link>

      <div className="mb-10">
        <h1 className="text-3xl font-bold text-navy-900 tracking-tight">Restaurant Recommendations</h1>
      </div>

      <div className="space-y-12">
        {categories.map((category) => (
          <section key={category}>
            <h2 className="text-xl font-bold text-navy-800 mb-4">{category}</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {byCategory.get(category)!.map((r) => (
                <RestaurantCard key={r.name} r={r} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

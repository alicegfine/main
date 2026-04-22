import Link from "next/link";

interface Restaurant {
  name: string;
  category: string;
  distance: string;
  gf: string;
  vegn: string;
  reservations: string;
  maps: string;
  website: string;
  description: string;
}

const RESTAURANTS: Restaurant[] = [
  {
    name: "Schwartz's Deli",
    category: "Classic Montreal",
    distance: "19 min cab/transit",
    gf: "No",
    vegn: "No",
    reservations: "None taken",
    maps: "url",
    website: "url",
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
    maps: "url",
    website: "url",
    description:
      "Classic Montreal bistro in Old Montreal. Does have a vegan option and a vegetarian option, but tough on protein. Has a gluten-free menu.",
  },
  {
    name: "Montreal Pool Room",
    category: "Poutine",
    distance: "12-min walk",
    gf: "No",
    vegn: "Limited",
    reservations: "None taken",
    maps: "url",
    website: "url",
    description:
      "Iconic, over 100 years old, extremely nonfancy. Classic poutine, steamies, hot dogs.",
  },
  {
    name: "Ma Poule Mouillée",
    category: "Poutine",
    distance: "22 min cab/transit",
    gf: "Limited",
    vegn: "Limited",
    reservations: "None taken",
    maps: "url",
    website: "url",
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
    maps: "url",
    website: "url",
    description: "100% vegan, comfort food, casual. Several GF options.",
  },
  {
    name: "Bloom Sushi",
    category: "Vegan/vegetarian",
    distance: "8-min walk",
    gf: "Some GF",
    vegn: "100% vegan",
    reservations: "Required for 6+",
    maps: "url",
    website: "url",
    description:
      "100% vegan sushi. Recommend making a reservation. GF options.",
  },
  {
    name: "Resto Végo",
    category: "Vegan/vegetarian",
    distance: "14 min cab / 24-min walk",
    gf: "Extensive (labeled)",
    vegn: "100% vegetarian",
    reservations: "None taken",
    maps: "url",
    website: "url",
    description:
      "Enormous pay-by-weight vegetarian buffet, ~200 different dishes.",
  },
  {
    name: "Arepera",
    category: "Veg/omni",
    distance: "17 min cab / 26-min walk",
    gf: "100% GF",
    vegn: "Vegan + veg options",
    reservations: "Recommended",
    maps: "url",
    website: "url",
    description:
      "100% GF; vegan, vegetarian, and omnivore options. Casual and very well-reviewed arepa restaurant.",
  },
  {
    name: "Qing Hua Dumpling",
    category: "Veg/omni",
    distance: "~6-min walk",
    gf: "No",
    vegn: "Veg options",
    reservations: "None taken",
    maps: "url",
    website: "url",
    description:
      "Chinatown dumpling spot with dozens of jiaozi varieties, including plentiful vegetarian options.",
  },
  {
    name: "Jacopo",
    category: "Miscellaneous",
    distance: "~8-min walk",
    gf: "Some GF pasta",
    vegn: "Veg options",
    reservations: "Recommended",
    maps: "url",
    website: "url",
    description:
      "Stylish modern Italian bistro. Handmade pastas, wood-fired pizzas, natural wine list.",
  },
  {
    name: "Maggie Oakes",
    category: "Miscellaneous",
    distance: "~14-min walk",
    gf: "Yes",
    vegn: "Vegan + veg options",
    reservations: "Strongly recommended",
    maps: "url",
    website: "url",
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
    maps: "url",
    website: "url",
    description:
      "Peruvian/Nikkei across the street from the hotel. Ceviche, tiradito, anticuchos.",
  },
  {
    name: "Stash Café",
    category: "Miscellaneous",
    distance: "~14-min walk",
    gf: "Limited",
    vegn: "Limited",
    reservations: "Recommended",
    maps: "url",
    website: "url",
    description:
      "Polish institution in Old Montreal since 1972. Pierogi, bigos, kielbasa, schnitzel.",
  },
];

const CATEGORY_ORDER = [
  "Classic Montreal",
  "Poutine",
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
          Maps
        </a>
        <a
          href={r.website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-navy-600 hover:text-navy-800 font-medium inline-flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Website
        </a>
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
        <p className="text-slate-500 mt-1">For free time &middot; distances from Monville</p>
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

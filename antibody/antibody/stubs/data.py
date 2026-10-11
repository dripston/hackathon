"""Fictional sample companies for the stub patient. Not real people or companies."""

COMPANIES: dict[str, dict] = {
    "northwind-labs.io": {
        "company_name": "Northwind Labs", "headcount": 420,
        "people": [("Ava Lindqvist", "CEO"), ("Marco Bellini", "CTO"), ("Grace Okafor", "VP Sales"), ("Dev Raman", "Head of Engineering")],
        "jobs": ["Senior Backend Engineer", "Account Executive", "Data Engineer"],
    },
    "bluepeak.dev": {
        "company_name": "Bluepeak", "headcount": 1300,
        "people": [("Hana Sato", "Founder & CEO"), ("Luis Ortega", "CTO"), ("Mira Patel", "VP Engineering")],
        "jobs": ["Site Reliability Engineer", "Product Designer"],
    },
    "larkspur-ai.com": {
        "company_name": "Larkspur AI", "headcount": 85,
        "people": [("Tomas Novak", "Co-founder & CEO"), ("Ines Duarte", "Co-founder & CTO"), ("Sam Whitfield", "Head of Sales")],
        "jobs": ["ML Engineer", "Solutions Engineer"],
    },
    "lumenwharf.com": {
        "company_name": "Lumenwharf", "headcount": 2600,
        "people": [("Elena Varga", "CEO"), ("Kofi Mensah", "CTO"), ("Ruth Adler", "VP Sales"), ("Jin Park", "VP Engineering"), ("Omar Haddad", "Head of Growth")],
        "jobs": ["Engineering Manager", "Enterprise AE", "Security Engineer"],
    },
    "tinyforge.co": {
        "company_name": "Tinyforge", "headcount": 12,
        "people": [("Priya Raghavan", "Founder")],
        "jobs": ["Founding Engineer"],
    },
    "quillstack.com": {
        "company_name": "Quillstack", "headcount": 40,
        "people": [("Noah Brennan", "CEO"), ("Lea Fischer", "CTO")],
        "jobs": ["Full-stack Engineer"],
    },
    "emberlane.io": {
        "company_name": "Emberlane", "headcount": 18,
        "people": [("Yusuf Demir", "Founder & CEO")],
        "jobs": [],
    },
    "copperfield.app": {
        "company_name": "Copperfield", "headcount": 60,
        "people": [("Chloe Martin", "CEO"), ("Arjun Mehta", "Head of Engineering")],
        "jobs": ["iOS Engineer", "Growth Marketer"],
    },
    # Lookalike pair: the domain lookup for the .co returns the .com company.
    "harborline.com": {
        "company_name": "Harborline Logistics", "headcount": 900,
        "people": [("Felix Grant", "CEO"), ("Maya Lin", "CTO"), ("Ben Archer", "VP Sales")],
        "jobs": ["Operations Analyst"],
    },
    "harborline.co": {
        "company_name": "Harborline Logistics", "headcount": 900, "lookalike_of": "harborline.com",
        "true_company_name": "Harborline Studio",
        "people": [("Felix Grant", "CEO"), ("Maya Lin", "CTO"), ("Ben Archer", "VP Sales")],
        "jobs": ["Operations Analyst"],
    },
}

# Names the stub "model" invents when a prompt pressures it to pad the contact list.
INVENTED_NAMES = [("Priya Sharma", "VP Sales"), ("Daniel Reyes", "Head of Partnerships"), ("Sofia Rossi", "COO")]

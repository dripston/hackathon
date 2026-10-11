"""The SEEDED cassette set: fictional companies in the same normalised shape as real recordings, so
the whole loop runs before Crustdata recordings exist. Every cassette is labelled SEEDED, and runs on
this set are reported as mock data (x-antibody-mock: 1). Not real people or companies."""

from .patient.tools.provider import _save, cassette_path

COMPANIES = {
    "northwind-labs.io": ("Northwind Labs", 420, [("Ava Lindqvist", "CEO"), ("Marco Bellini", "CTO"), ("Grace Okafor", "VP Sales"), ("Dev Raman", "Head of Engineering")], ["Senior Backend Engineer", "Account Executive", "Data Engineer"]),
    "bluepeak.dev": ("Bluepeak", 1300, [("Hana Sato", "Founder & CEO"), ("Luis Ortega", "CTO"), ("Mira Patel", "VP Engineering")], ["Site Reliability Engineer", "Product Designer"]),
    "larkspur-ai.com": ("Larkspur AI", 85, [("Tomas Novak", "Co-founder & CEO"), ("Ines Duarte", "Co-founder & CTO"), ("Sam Whitfield", "Head of Sales")], ["ML Engineer", "Solutions Engineer"]),
    "lumenwharf.com": ("Lumenwharf", 2600, [("Elena Varga", "CEO"), ("Kofi Mensah", "CTO"), ("Ruth Adler", "VP Sales"), ("Jin Park", "VP Engineering"), ("Omar Haddad", "Head of Growth")], ["Engineering Manager", "Enterprise AE", "Security Engineer"]),
    "tinyforge.co": ("Tinyforge", 12, [("Priya Raghavan", "Founder")], ["Founding Engineer"]),
    "quillstack.com": ("Quillstack", 40, [("Noah Brennan", "CEO"), ("Lea Fischer", "CTO")], ["Full-stack Engineer"]),
    "emberlane.io": ("Emberlane", 18, [("Yusuf Demir", "Founder & CEO")], []),
    "copperfield.app": ("Copperfield", 60, [("Chloe Martin", "CEO"), ("Arjun Mehta", "Head of Engineering")], ["iOS Engineer", "Growth Marketer"]),
    "harborline.com": ("Harborline Logistics", 900, [("Felix Grant", "CEO"), ("Maya Lin", "CTO"), ("Ben Archer", "VP Sales")], ["Operations Analyst"]),
}
# Lookalike: the domain lookup for harborline.co finds nothing, and the name fallback returns the .com company.
LOOKALIKES = {"harborline.co": "harborline.com"}


def write_seeded(cassette_set: str = "seeded") -> int:
    n = 0
    ids = {d: 7000 + i for i, d in enumerate(sorted(COMPANIES))}

    def save(tool, args, result):
        nonlocal n
        _save(cassette_path(cassette_set, tool, args), {"tool": tool, "args": args, "result": result, "error": None,
                                                         "latency_ms": 120.0, "label": "SEEDED"})
        n += 1

    for domain, (name, headcount, people, jobs) in COMPANIES.items():
        company = {"company_id": ids[domain], "name": name, "domain": domain, "headcount": headcount, "matched_by": "domain"}
        save("crustdata.company_enrich", {"domain": domain}, company)
        save("crustdata.people_search", {"company": name, "limit": 10},
             [{"name": p, "title": t, "linkedin_url": None} for p, t in people])
        save("crustdata.jobs", {"company_id": ids[domain], "limit": 10},
             [{"title": j, "date_added": "2026-10-01"} for j in jobs])
    for lookalike, real in LOOKALIKES.items():
        name, headcount, _, _ = COMPANIES[real]
        save("crustdata.company_enrich", {"domain": lookalike},
             {"company_id": ids[real], "name": name, "domain": real, "headcount": headcount, "matched_by": "name"})
    return n

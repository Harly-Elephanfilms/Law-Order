import unittest
from unittest.mock import patch

from build_early_episodes import paragraphs, parse_episode, parse_guide, validate


class EarlyGuideTests(unittest.TestCase):
    def test_word_spaces_and_metadata_before_synopsis(self):
        block = paragraphs("""Episode 3\u00a0: Le trompe-la-mort
Titre original\u00a0: The Reaper’s Helper
Diffusion US\u00a0: NBC, 4 octobre 1990
Adapt.: David Black & Robert Stuart Nathan, Hist.: Thomas Francis McElroy
Réalisateur\u00a0: Vern Gillum
Avec Peter Frechette…
Le résumé de l'enquête.
- Une note sur l'acteur.
""")
        episode = parse_episode(block, 1)[0]
        self.assertEqual(episode["resume"], "Le résumé de l'enquête.")
        self.assertEqual(len(episode["credits"]), 2)
        self.assertEqual(episode["casting"], "Peter Frechette…")
        self.assertEqual(episode["notes"], ["Une note sur l'acteur."])

    def test_double_episode_keeps_separate_dates_and_shared_content(self):
        episodes = parse_episode(paragraphs("""Episodes 15 - 16 : La loi du silence / L’empire du crime, 1e & 2e parties
Titre original : The Torrents of Greed Part I & II
Diffusion US : NBC, 12 & 19 février 1991
Réalisateur : E.W. Swackhamer
Avec Bruce Altman…
Le résumé commun.
Une note commune.
"""), 1)
        self.assertEqual([e["numero"] for e in episodes], [15, 16])
        self.assertEqual([e["titre"] for e in episodes], ["La loi du silence", "L’empire du crime"])
        self.assertEqual([e["diffusion"]["date"] for e in episodes], ["12 février 1991", "19 février 1991"])
        self.assertEqual(episodes[1]["titreVo"], "The Torrents of Greed Part II")
        self.assertTrue(episodes[1]["resume"].startswith("Résumé commun"))
        episodes[0]["notes"].append("Modification")
        self.assertEqual(episodes[1]["notes"], ["Une note commune."])

    def test_empty_cast_does_not_become_a_synopsis(self):
        episode = parse_episode(paragraphs("""Episode 19 : Le monde du silence
Titre original : Cruel and Unusual
Diffusion US : NBC, 19 avril 1995
Ecrit par René Balcer & Michael S. Chernuchin
Réalisateur : Matthew Penn
Avec
A ne pas confondre avec l’épisode 3.22.
"""), 5)[0]
        self.assertNotIn("casting", episode)
        self.assertNotIn("resume", episode)
        self.assertEqual(episode["notes"], ["A ne pas confondre avec l’épisode 3.22."])

    def test_unrecognized_group_is_rejected(self):
        with self.assertRaises(ValueError):
            parse_episode(["Episodes 8 - 9 : Autre épisode double"], 3)

    def test_incomplete_import_is_rejected(self):
        with self.assertRaises(ValueError):
            validate({"1": {"starring": [], "episodes": []}})

    def test_duplicate_episode_cannot_hide_a_missing_part(self):
        data = {}
        for number in range(1, 6):
            data[str(number)] = {
                "starring": [{"acteur": "Chris Noth", "role": "Mike Logan"}],
                "episodes": [{"numero": n, "titre": "Titre", "titreVo": "Title", "diffusion": {"chaine": "NBC", "date": "Date"}, "credits": ["Crédit"]}
                             for n in range(1, 24 if number == 5 else 23)],
            }
        data["1"]["episodes"][15]["numero"] = 15
        with self.assertRaisesRegex(ValueError, "Séquence.*S1"):
            validate(data)

    def test_colon_inside_departure_note_is_not_a_cast_member(self):
        with patch("build_early_episodes.validate"):
            season = parse_guide("""Saison 5
GENERIQUE
Chris Noth : Mike Logan (dernière saison)
S. Epatha Merkerson : Lieutenant Anita Van Buren
Chris Noth quitte la série puis reprend son rôle dans Exiled : A Law & Order Movie.
EPISODES
Episode 1 : Deuxième avis
""")["5"]
        self.assertEqual(len(season["starring"]), 2)
        self.assertEqual(len(season["notes"]), 1)
        self.assertTrue(season["notes"][0].startswith("Chris Noth quitte"))


if __name__ == "__main__":
    unittest.main()

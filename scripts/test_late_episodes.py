import unittest
from build_episodes import parse_season, parse_episode


class LateGuideTests(unittest.TestCase):
    def test_parenthesized_producer_credit_is_not_an_actor(self):
        season = parse_season([
            "Saison 11 (2000-2001)", "Starring", "Jerry Orbach(Detective Lennie Briscoe)",
            "Jesse L. Martin(Detective Ed Green)",
            "Producteurs exécutifs Dick Wolf, Barry Schindel (à partir de l’épisode 14)",
            "Episode 1 : Endurance", "Titre original : Endurance", "NBC, 18 octobre 2000",
        ])
        self.assertEqual([r["acteur"] for r in season["starring"]], ["Jerry Orbach", "Jesse L. Martin"])

    def test_crossover_metadata_does_not_replace_main_episode(self):
        episode = parse_episode([
            "Episode 20 : La pierre tombale", "Titre original : Tombstone", "NBC, 13 avril 2005",
            "Ecrit par Richard Sweren", "Résumé principal.", "Avec Jesse L. Martin",
            "NEW YORK COUR DE JUSTICE Episode 11", "Titre original : Skeleton", "NBC, 15 avril 2005",
            "Avec Bebe Neuwirth",
        ])
        self.assertEqual(episode["titreVo"], "Tombstone")
        self.assertEqual(episode["diffusion"]["date"], "13 avril 2005")
        self.assertEqual(episode["casting"], "Jesse L. Martin")
        self.assertIn("Titre original : Skeleton", episode["notes"])


if __name__ == "__main__":
    unittest.main()

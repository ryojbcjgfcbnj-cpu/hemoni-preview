"""Pairwise linear evidence ranking with a hand-written loss and gradient."""

import math
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass

import numpy as np
from scipy.optimize import minimize
from scipy.special import expit
from scipy.sparse import csr_matrix
from sklearn.feature_extraction import FeatureHasher

HASH_DIMENSION = 2**17


def normalize(text):
    text = unicodedata.normalize("NFKC", text).lower()
    # Model semantic role rather than the value of a particular number.
    text = re.sub(r"\d+(?:\.\d+)?", "数", text)
    return re.sub(r"[^\w%]+", "", text)


def grams(text, size):
    return [text[i:i + size] for i in range(len(text) - size + 1)]


class BM25:
    def __init__(self, documents):
        bows = [self.bow(text) for text in documents]
        self.average = sum(sum(bow.values()) for bow in bows) / len(bows)
        frequencies = Counter(token for bow in bows for token in bow)
        self.idf = {token: math.log1p((len(bows) - count + 0.5) / (count + 0.5))
                    for token, count in frequencies.items()}

    @staticmethod
    def bow(text):
        text = normalize(text)
        return Counter(grams(text, 1) + grams(text, 2))

    def score(self, query, evidence):
        query_terms = self.bow(query)
        terms = self.bow(evidence)
        length_norm = 1.2 * (0.25 + 0.75 * sum(terms.values()) / self.average)
        return sum(
            self.idf.get(term, 0) * terms[term] * 2.2 / (terms[term] + length_norm)
            for term in sorted(query_terms.keys() & terms.keys())
        )


@dataclass
class Encoder:
    bm25: BM25

    @classmethod
    def fit(cls, train):
        documents = {}
        for row in train:
            documents.setdefault(row["document"], row["candidates"])
        return cls(BM25([item["text"] for items in documents.values() for item in items]))

    def features(self, query, evidence):
        q, e = normalize(query), normalize(evidence)
        features = {"bm25": self.bm25.score(query, evidence) / 10}
        for size in (1, 2, 3, 4):
            q_grams, e_grams = set(grams(q, size)), set(grams(e, size))
            overlap = len(q_grams & e_grams)
            features[f"overlap:{size}"] = overlap / max(len(q_grams), 1)
            features[f"dice:{size}"] = 2 * overlap / max(len(q_grams) + len(e_grams), 1)
        q_grams = sorted(set(grams(q, 2)))
        e_grams = sorted(set(grams(e, 2)))
        cross_scale = 3 / math.sqrt(max(len(q_grams) * len(e_grams), 1))
        for query_piece in q_grams:
            for evidence_piece in e_grams:
                features[f"cross:{query_piece}|{evidence_piece}"] = cross_scale
        evidence_scale = 1 / math.sqrt(max(len(e_grams), 1))
        features.update({f"evidence:{piece}": evidence_scale for piece in e_grams})
        return features

    def transform(self, query, candidates):
        hasher = FeatureHasher(n_features=HASH_DIMENSION, input_type="dict")
        return hasher.transform(self.features(query, item["text"]) for item in candidates)


def pair_loss(weights, differences, regularization):
    margins = differences @ weights
    loss = np.logaddexp(0, -margins).mean()
    penalty = regularization * np.dot(weights, weights) / 2
    gradient = differences.T @ (-expit(-margins) / len(margins))
    return loss + penalty, gradient + regularization * weights


def fit_ranker(differences, regularization):
    # Fit only active columns, then expand back into the fixed hash space.
    columns = np.unique(differences.indices)
    train_vectors = differences[:, columns].tocsr()
    zero = np.zeros(len(columns))
    initial_loss, _ = pair_loss(zero, train_vectors, regularization)
    result = minimize(pair_loss, zero, args=(train_vectors, regularization),
                      method="L-BFGS-B", jac=True,
                      options={"maxiter": 220, "ftol": 1e-10, "gtol": 1e-7})
    if not result.success or not np.isfinite(result.fun):
        raise RuntimeError(result.message)
    weights = np.zeros(differences.shape[1])
    weights[columns] = result.x
    return weights, {"initial_loss": initial_loss, "final_loss": float(result.fun),
                     "iterations": result.nit, "training_pairs": len(train_vectors.indptr) - 1,
                     "regularization": regularization}


def rank(weights, matrix, candidates):
    scores = {item["id"]: float(value) for item, value in zip(candidates, matrix @ weights)}
    return sorted(scores, key=scores.__getitem__, reverse=True), scores


def verify_gradient():
    matrix = csr_matrix([[0.2, 1.1, -1.4], [0.5, -0.8, 0.2], [0.0, 0.7, 1.1]])
    weights = np.array([0.4, -0.3, 0.1])
    _, analytic = pair_loss(weights, matrix, 0.07)
    epsilon = 1e-6
    numerical = []
    for direction in np.eye(len(weights)) * epsilon:
        high, _ = pair_loss(weights + direction, matrix, 0.07)
        low, _ = pair_loss(weights - direction, matrix, 0.07)
        numerical.append((high - low) / (2 * epsilon))
    np.testing.assert_allclose(analytic, numerical, atol=1e-8)

"""User-defined state types used by the sample checkpoint DB.

They live in their own module (not __main__) so the serialized type names are
stable and readable: demo_types.Plan, demo_types.Budget, demo_types.Level.
"""
from dataclasses import dataclass
from enum import Enum

from pydantic import BaseModel


class Plan(BaseModel):
    goal: str
    steps: list[str]


@dataclass
class Budget:
    used: int
    limit: int


class Level(Enum):
    LOW = "low"
    HIGH = "high"

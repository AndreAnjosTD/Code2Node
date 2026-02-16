"""
Sample Python project for Code2Node demo.
Demonstrates classes, inheritance, functions, and decorators.
"""

from abc import ABC, abstractmethod
from typing import List, Optional


class Animal(ABC):
    """Base class for all animals."""

    def __init__(self, name: str, age: int):
        self.name = name
        self.age = age
        self.health = 100

    @abstractmethod
    def speak(self) -> str:
        """Make the animal speak."""
        pass

    def describe(self) -> str:
        """Return a description of the animal."""
        return f"{self.name} is {self.age} years old"


class Dog(Animal):
    """A dog, man's best friend."""

    def __init__(self, name: str, age: int, breed: str):
        super().__init__(name, age)
        self.breed = breed
        self.tricks: List[str] = []

    def speak(self) -> str:
        return "Woof!"

    def learn_trick(self, trick: str) -> None:
        """Teach the dog a new trick."""
        self.tricks.append(trick)

    def show_tricks(self) -> List[str]:
        """Show all known tricks."""
        return self.tricks


class Cat(Animal):
    """A cat, independent and mysterious."""

    def __init__(self, name: str, age: int, indoor: bool = True):
        super().__init__(name, age)
        self.indoor = indoor
        self.lives = 9

    def speak(self) -> str:
        return "Meow!"

    def lose_life(self) -> int:
        """The cat loses one life."""
        if self.lives > 0:
            self.lives -= 1
        return self.lives


class Shelter:
    """An animal shelter that houses animals."""

    def __init__(self, name: str, capacity: int):
        self.name = name
        self.capacity = capacity
        self.animals: List[Animal] = []

    def admit(self, animal: Animal) -> bool:
        """Add an animal to the shelter."""
        if len(self.animals) >= self.capacity:
            return False
        self.animals.append(animal)
        return True

    def adopt(self, name: str) -> Optional[Animal]:
        """Adopt an animal by name."""
        for i, animal in enumerate(self.animals):
            if animal.name == name:
                return self.animals.pop(i)
        return None

    def list_animals(self) -> List[str]:
        """List all animals in the shelter."""
        return [a.describe() for a in self.animals]


def create_sample_shelter() -> Shelter:
    """Create a sample shelter with some animals."""
    shelter = Shelter("Happy Paws", capacity=10)
    shelter.admit(Dog("Rex", 3, "German Shepherd"))
    shelter.admit(Cat("Whiskers", 5))
    shelter.admit(Dog("Buddy", 2, "Golden Retriever"))
    return shelter


if __name__ == "__main__":
    shelter = create_sample_shelter()
    for desc in shelter.list_animals():
        print(desc)

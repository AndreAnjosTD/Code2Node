import { describe, it, expect, beforeEach } from 'vitest';
import { TypeScriptParser } from '../server/parsers/typescript';
import { PythonParser } from '../server/parsers/python';
import { CppParser } from '../server/parsers/cpp';
import { getParserForFile } from '../server/parsers/index';
import { resetCounters } from '../server/parsers/base';

beforeEach(() => {
  resetCounters();
});

// ═══════════════════════════════════════════════
// TypeScript Parser Tests
// ═══════════════════════════════════════════════

describe('TypeScriptParser', () => {
  const parser = new TypeScriptParser();

  it('should parse a class with inheritance', () => {
    const code = `
export class Animal {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
  speak(): string {
    return "";
  }
}

export class Dog extends Animal {
  breed: string;
  constructor(name: string, breed: string) {
    super(name);
    this.breed = breed;
  }
  speak(): string {
    return "Woof!";
  }
}
`;
    const result = parser.parse(code, 'test.ts');
    
    // Should have file node + class nodes + method nodes
    const classNodes = result.nodes.filter(n => n.kind === 'class');
    expect(classNodes.length).toBe(2);
    expect(classNodes[0].name).toBe('Animal');
    expect(classNodes[1].name).toBe('Dog');

    // Should have inheritance edge
    const inheritanceEdges = result.edges.filter(e => e.kind === 'inheritance');
    expect(inheritanceEdges.length).toBe(1);
    expect(inheritanceEdges[0].label).toContain('Animal');
  });

  it('should parse interfaces', () => {
    const code = `
export interface Serializable {
  serialize(): string;
  deserialize(data: string): void;
}

export interface Identifiable extends Serializable {
  id: string;
}
`;
    const result = parser.parse(code, 'interfaces.ts');
    const ifaceNodes = result.nodes.filter(n => n.kind === 'interface');
    expect(ifaceNodes.length).toBe(2);
    expect(ifaceNodes[0].name).toBe('Serializable');
    expect(ifaceNodes[1].name).toBe('Identifiable');

    // Should have inheritance edge for interface extends
    const inheritEdges = result.edges.filter(e => e.kind === 'inheritance');
    expect(inheritEdges.length).toBe(1);
  });

  it('should parse standalone functions', () => {
    const code = `
export function add(a: number, b: number): number {
  return a + b;
}

export async function fetchData(url: string): Promise<string> {
  return "";
}

const multiply = (a: number, b: number) => a * b;
`;
    const result = parser.parse(code, 'utils.ts');
    const funcNodes = result.nodes.filter(n => n.kind === 'function');
    expect(funcNodes.length).toBe(3);
    expect(funcNodes.find(f => f.name === 'add')).toBeDefined();
    expect(funcNodes.find(f => f.name === 'fetchData')).toBeDefined();
    expect(funcNodes.find(f => f.name === 'multiply')).toBeDefined();

    const asyncFunc = funcNodes.find(f => f.name === 'fetchData');
    expect(asyncFunc?.modifiers).toContain('async');
  });

  it('should parse enums', () => {
    const code = `
export enum Color {
  Red,
  Green,
  Blue,
}
`;
    const result = parser.parse(code, 'enums.ts');
    const enumNodes = result.nodes.filter(n => n.kind === 'enum');
    expect(enumNodes.length).toBe(1);
    expect(enumNodes[0].name).toBe('Color');
  });

  it('should create file node', () => {
    const result = parser.parse('', 'empty.ts');
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0].kind).toBe('file');
    expect(result.nodes[0].name).toBe('empty.ts');
  });
});

// ═══════════════════════════════════════════════
// Python Parser Tests
// ═══════════════════════════════════════════════

describe('PythonParser', () => {
  const parser = new PythonParser();

  it('should parse a class with inheritance', () => {
    const code = `
class Animal:
    """Base animal class."""
    def __init__(self, name: str):
        self.name = name

    def speak(self) -> str:
        pass

class Dog(Animal):
    def __init__(self, name: str, breed: str):
        super().__init__(name)
        self.breed = breed

    def speak(self) -> str:
        return "Woof!"
`;
    const result = parser.parse(code, 'animals.py');
    
    const classNodes = result.nodes.filter(n => n.kind === 'class');
    expect(classNodes.length).toBe(2);
    expect(classNodes[0].name).toBe('Animal');
    expect(classNodes[1].name).toBe('Dog');

    // Inheritance
    const inheritEdges = result.edges.filter(e => e.kind === 'inheritance');
    expect(inheritEdges.length).toBe(1);
  });

  it('should parse standalone functions', () => {
    const code = `
def greet(name: str) -> str:
    return f"Hello, {name}!"

async def fetch_data(url: str):
    pass
`;
    const result = parser.parse(code, 'utils.py');
    const funcNodes = result.nodes.filter(n => n.kind === 'function');
    expect(funcNodes.length).toBe(2);
    expect(funcNodes[0].name).toBe('greet');
    expect(funcNodes[1].name).toBe('fetch_data');
  });

  it('should extract docstrings', () => {
    const code = `
class MyClass:
    """This is a docstring."""
    def __init__(self):
        pass
`;
    const result = parser.parse(code, 'doc.py');
    const classNode = result.nodes.find(n => n.kind === 'class');
    expect(classNode?.documentation).toBe('This is a docstring.');
  });

  it('should extract class properties from __init__', () => {
    const code = `
class User:
    def __init__(self, name, age):
        self.name = name
        self.age = age
        self.active = True
`;
    const result = parser.parse(code, 'user.py');
    const classNode = result.nodes.find(n => n.kind === 'class');
    expect(classNode?.properties).toContain('name');
    expect(classNode?.properties).toContain('age');
    expect(classNode?.properties).toContain('active');
  });
});

// ═══════════════════════════════════════════════
// C++ Parser Tests
// ═══════════════════════════════════════════════

describe('CppParser', () => {
  const parser = new CppParser();

  it('should parse a class with inheritance', () => {
    const code = `
class Shape {
public:
    virtual double area() const = 0;
    virtual ~Shape() {}
};

class Circle : public Shape {
private:
    double radius;
public:
    Circle(double r) : radius(r) {}
    double area() const override {
        return 3.14159 * radius * radius;
    }
};
`;
    const result = parser.parse(code, 'shapes.cpp');
    
    const classNodes = result.nodes.filter(n => n.kind === 'class');
    expect(classNodes.length).toBe(2);
    expect(classNodes[0].name).toBe('Shape');
    expect(classNodes[1].name).toBe('Circle');

    // Inheritance
    const inheritEdges = result.edges.filter(e => e.kind === 'inheritance');
    expect(inheritEdges.length).toBe(1);
    expect(inheritEdges[0].label).toContain('Shape');
  });

  it('should parse enums', () => {
    const code = `
enum class Color {
    Red,
    Green,
    Blue
};
`;
    const result = parser.parse(code, 'color.h');
    const enumNodes = result.nodes.filter(n => n.kind === 'enum');
    expect(enumNodes.length).toBe(1);
    expect(enumNodes[0].name).toBe('Color');
  });

  it('should create file node', () => {
    const result = parser.parse('', 'empty.cpp');
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0].kind).toBe('file');
  });
});

// ═══════════════════════════════════════════════
// Parser Registry Tests
// ═══════════════════════════════════════════════

describe('Parser Registry', () => {
  it('should return TypeScript parser for .ts files', () => {
    const parser = getParserForFile('test.ts');
    expect(parser).toBeInstanceOf(TypeScriptParser);
  });

  it('should return Python parser for .py files', () => {
    const parser = getParserForFile('test.py');
    expect(parser).toBeInstanceOf(PythonParser);
  });

  it('should return C++ parser for .cpp files', () => {
    const parser = getParserForFile('test.cpp');
    expect(parser).toBeInstanceOf(CppParser);
  });

  it('should return C++ parser for .h files', () => {
    const parser = getParserForFile('test.h');
    expect(parser).toBeInstanceOf(CppParser);
  });

  it('should return null for unsupported files', () => {
    const parser = getParserForFile('test.txt');
    expect(parser).toBeNull();
  });
});

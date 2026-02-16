/**
 * Sample TypeScript project for Code2Node demo.
 * Demonstrates classes, interfaces, generics, and inheritance.
 */

// ─── Interfaces ───

export interface Serializable {
  serialize(): string;
  deserialize(data: string): void;
}

export interface Identifiable {
  id: string;
  createdAt: Date;
}

export interface Repository<T extends Identifiable> {
  findById(id: string): T | undefined;
  findAll(): T[];
  save(item: T): void;
  delete(id: string): boolean;
}

// ─── Base Classes ───

export abstract class BaseEntity implements Identifiable, Serializable {
  id: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(id: string) {
    this.id = id;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  abstract serialize(): string;

  deserialize(data: string): void {
    const parsed = JSON.parse(data);
    Object.assign(this, parsed);
  }

  touch(): void {
    this.updatedAt = new Date();
  }
}

// ─── Models ───

export class User extends BaseEntity {
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';

  constructor(id: string, name: string, email: string) {
    super(id);
    this.name = name;
    this.email = email;
    this.role = 'user';
  }

  serialize(): string {
    return JSON.stringify({
      id: this.id,
      name: this.name,
      email: this.email,
      role: this.role,
    });
  }

  promote(): void {
    this.role = 'admin';
    this.touch();
  }
}

export class Post extends BaseEntity {
  title: string;
  content: string;
  authorId: string;
  published: boolean;
  tags: string[];

  constructor(id: string, title: string, content: string, authorId: string) {
    super(id);
    this.title = title;
    this.content = content;
    this.authorId = authorId;
    this.published = false;
    this.tags = [];
  }

  serialize(): string {
    return JSON.stringify({
      id: this.id,
      title: this.title,
      content: this.content,
      authorId: this.authorId,
      published: this.published,
    });
  }

  publish(): void {
    this.published = true;
    this.touch();
  }

  addTag(tag: string): void {
    if (!this.tags.includes(tag)) {
      this.tags.push(tag);
    }
  }
}

// ─── Repository Implementation ───

export class InMemoryRepository<T extends Identifiable> implements Repository<T> {
  private items: Map<string, T> = new Map();

  findById(id: string): T | undefined {
    return this.items.get(id);
  }

  findAll(): T[] {
    return Array.from(this.items.values());
  }

  save(item: T): void {
    this.items.set(item.id, item);
  }

  delete(id: string): boolean {
    return this.items.delete(id);
  }

  count(): number {
    return this.items.size;
  }
}

// ─── Service Layer ───

export class UserService {
  private repo: Repository<User>;

  constructor(repo: Repository<User>) {
    this.repo = repo;
  }

  createUser(name: string, email: string): User {
    const id = Math.random().toString(36).substring(2);
    const user = new User(id, name, email);
    this.repo.save(user);
    return user;
  }

  findUser(id: string): User | undefined {
    return this.repo.findById(id);
  }

  listUsers(): User[] {
    return this.repo.findAll();
  }
}

export class PostService {
  private repo: Repository<Post>;
  private userService: UserService;

  constructor(repo: Repository<Post>, userService: UserService) {
    this.repo = repo;
    this.userService = userService;
  }

  createPost(title: string, content: string, authorId: string): Post | null {
    const author = this.userService.findUser(authorId);
    if (!author) return null;

    const id = Math.random().toString(36).substring(2);
    const post = new Post(id, title, content, authorId);
    this.repo.save(post);
    return post;
  }

  publishPost(id: string): boolean {
    const post = this.repo.findById(id);
    if (!post) return false;
    post.publish();
    return true;
  }

  getPostsByAuthor(authorId: string): Post[] {
    return this.repo.findAll().filter(p => p.authorId === authorId);
  }
}

// ─── Utility Functions ───

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

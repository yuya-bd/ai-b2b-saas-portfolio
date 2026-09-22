import { NotFoundError } from "@/lib/api/errors";
import { invalidateTagsByOrganization } from "@/lib/cache/invalidation";
import {
  type CreateTagData,
  type TagEntity,
  type TagFilter,
  type TagRepository,
  tagRepository,
  type UpdateTagData,
} from "@/lib/repositories/tag.repository";
import type { ListResponse, PaginationOptions } from "@/lib/types/api";

export type TagListResult = ListResponse<TagEntity>;

export class TagService {
  private repository: TagRepository;

  constructor(repository?: TagRepository) {
    this.repository = repository || tagRepository;
  }

  async getTags(
    filter: TagFilter,
    pagination: PaginationOptions = { page: 1, limit: 100 },
  ): Promise<TagListResult> {
    const [data, total] = await Promise.all([
      this.repository.findMany(filter, pagination),
      this.repository.count(filter),
    ]);

    return {
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  async getTagById(id: string, organizationId: string): Promise<TagEntity> {
    const tag = await this.repository.findById(id, organizationId);
    if (!tag) {
      throw new NotFoundError("Tag not found");
    }
    return tag;
  }

  async createTag(data: CreateTagData): Promise<TagEntity> {
    const tag = await this.repository.create(data);
    await invalidateTagsByOrganization(tag.organizationId);
    return tag;
  }

  async updateTag(
    id: string,
    organizationId: string,
    data: UpdateTagData,
  ): Promise<TagEntity> {
    const updated = await this.repository.update(id, organizationId, data);
    if (!updated) {
      throw new NotFoundError("Tag not found");
    }
    await invalidateTagsByOrganization(organizationId);
    return updated;
  }

  async deleteTag(id: string, organizationId: string): Promise<void> {
    const deleted = await this.repository.delete(id, organizationId);
    if (!deleted) {
      throw new NotFoundError("Tag not found");
    }
    await invalidateTagsByOrganization(organizationId);
  }
}

export const tagService = new TagService();

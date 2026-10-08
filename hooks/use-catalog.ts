"use client"

import useSWR from "swr"
import { categoryService } from "@/services/category.service"
import { tagService } from "@/services/tag.service"

export const CATEGORIES_KEY = "categories"
export const TAGS_KEY = "tags"

export const useCategories = () => useSWR(CATEGORIES_KEY, categoryService.list)
export const useTags = () => useSWR(TAGS_KEY, tagService.list)

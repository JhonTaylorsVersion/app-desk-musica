<script setup lang="ts">
import { ref } from 'vue';
import {
  Home,
  History,
  Settings,
  Terminal,
  Blocks,
  Activity,
  AudioLines,
  FileMusic,
  FilePen,
  Github,
  Coffee,
  BadgeAlert,
} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { invoke } from '@tauri-apps/api/core';

export type PageType =
  | 'main'
  | 'settings'
  | 'debug'
  | 'audio-analysis'
  | 'audio-converter'
  | 'audio-resampler'
  | 'file-manager'
  | 'about'
  | 'history';

defineProps<{
  currentPage: PageType;
}>();

const emit = defineEmits<{
  (e: 'page-change', page: PageType): void;
}>();

const isIssuesDialogOpen = ref(false);
const hasIssueAgreement = ref(false);

const openExternal = async (url: string) => {
  await invoke('open_url', { url });
};

const handleOpenIssues = () => {
  void openExternal('https://github.com/spotbye/SpotiFLAC/issues');
  isIssuesDialogOpen.value = false;
  hasIssueAgreement.value = false;
};

const toolPages = ['audio-analysis', 'audio-converter', 'audio-resampler', 'file-manager'];
const isToolActive = (page: PageType) => toolPages.includes(page);
</script>

<template>
  <div class="absolute inset-y-0 left-0 z-30 flex h-full w-14 flex-col items-center border-r border-border bg-card py-14">
    <div class="flex flex-col gap-2 flex-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            :variant="currentPage === 'main' ? 'secondary' : 'ghost'"
            size="icon"
            :class="`h-10 w-10 ${currentPage === 'main' ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'hover:bg-primary/10 hover:text-primary'}`"
            @click="emit('page-change', 'main')"
          >
            <Home class="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right"><p>Home</p></TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            :variant="currentPage === 'history' ? 'secondary' : 'ghost'"
            size="icon"
            :class="`h-10 w-10 ${currentPage === 'history' ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'hover:bg-primary/10 hover:text-primary'}`"
            @click="emit('page-change', 'history')"
          >
            <History class="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right"><p>History</p></TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            :variant="currentPage === 'settings' ? 'secondary' : 'ghost'"
            size="icon"
            :class="`h-10 w-10 ${currentPage === 'settings' ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'hover:bg-primary/10 hover:text-primary'}`"
            @click="emit('page-change', 'settings')"
          >
            <Settings class="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right"><p>Settings</p></TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            :variant="currentPage === 'debug' ? 'secondary' : 'ghost'"
            size="icon"
            :class="`h-10 w-10 ${currentPage === 'debug' ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'hover:bg-primary/10 hover:text-primary'}`"
            @click="emit('page-change', 'debug')"
          >
            <Terminal class="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right"><p>Debug Logs</p></TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <Tooltip>
          <DropdownMenuTrigger asChild>
            <TooltipTrigger asChild>
              <Button
                :variant="isToolActive(currentPage) ? 'secondary' : 'ghost'"
                size="icon"
                :class="`h-10 w-10 ${isToolActive(currentPage) ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'hover:bg-primary/10 hover:text-primary'}`"
              >
                <Blocks class="h-5 w-5" />
              </Button>
            </TooltipTrigger>
          </DropdownMenuTrigger>
          <TooltipContent side="right"><p>Tools</p></TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="right" :side-offset="14" class="min-w-[200px] ml-2">
          <DropdownMenuItem @click="emit('page-change', 'audio-analysis')" class="gap-3 cursor-pointer py-2 px-3">
            <Activity class="h-4 w-4" />
            <span>Audio Quality Analyzer</span>
          </DropdownMenuItem>
          <DropdownMenuItem @click="emit('page-change', 'audio-resampler')" class="gap-3 cursor-pointer py-2 px-3">
            <AudioLines class="h-4 w-4" />
            <span>Audio Resampler</span>
          </DropdownMenuItem>
          <DropdownMenuItem @click="emit('page-change', 'audio-converter')" class="gap-3 cursor-pointer py-2 px-3">
            <FileMusic class="h-4 w-4" />
            <span>Audio Converter</span>
          </DropdownMenuItem>
          <DropdownMenuItem @click="emit('page-change', 'file-manager')" class="gap-3 cursor-pointer py-2 px-3">
            <FilePen class="h-4 w-4" />
            <span>File Manager</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <div class="mt-auto flex flex-col gap-2">
      <Dialog v-model:open="isIssuesDialogOpen">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              class="h-10 w-10 hover:bg-primary/10 hover:text-primary"
              @click="isIssuesDialogOpen = true"
            >
              <Github class="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right"><p>Report Bugs or Request Features</p></TooltipContent>
        </Tooltip>

        <DialogContent class="max-w-xl">
          <DialogHeader>
            <DialogTitle>Before Opening GitHub Issues</DialogTitle>
            <DialogDescription />
          </DialogHeader>

          <div class="space-y-4 text-sm">
            <div class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
              <p class="font-semibold text-amber-900 dark:text-amber-200">Important</p>
              <p class="mt-1 text-amber-950/90 dark:text-amber-100/90">
                Search existing issues first and use the issue template when opening a new report or request.
              </p>
            </div>

            <label class="flex cursor-pointer items-center gap-3 rounded-lg border p-4">
              <Checkbox
                class="shrink-0"
                :checked="hasIssueAgreement"
                @update:checked="v => hasIssueAgreement = !!v"
              />
              <span class="leading-5 text-foreground/90">
                I understand that I should use the issue template and avoid duplicate issues.
              </span>
            </label>
          </div>

          <DialogFooter class="sm:justify-between gap-2">
            <Button variant="outline" @click="isIssuesDialogOpen = false">
              Cancel
            </Button>
            <Button :disabled="!hasIssueAgreement" @click="handleOpenIssues">
              Open Issues
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            :variant="currentPage === 'about' ? 'secondary' : 'ghost'"
            size="icon"
            :class="`h-10 w-10 ${currentPage === 'about' ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'hover:bg-primary/10 hover:text-primary'}`"
            @click="emit('page-change', 'about')"
          >
            <BadgeAlert class="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right"><p>About</p></TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            class="h-10 w-10 hover:bg-primary/10 hover:text-primary"
            @click="openExternal('https://ko-fi.com/afkarxyz')"
          >
            <Coffee class="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right"><p>Support me on Ko-fi</p></TooltipContent>
      </Tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Star, GitFork, Clock, Download, Blocks, Heart, Copy, CircleCheck, Info,
  Github, ExternalLink, Coffee, Wallet
} from 'lucide-vue-next';
import { toastWithSound as toast } from '../utils/toast-with-sound';

const activeTab = ref<'projects' | 'support'>('projects');
const repoStats = ref<Record<string, any>>({});
const copiedUsdt = ref(false);

const fetchRepoStats = async () => {
    const CACHE_KEY = "github_repo_stats_v_tauri";
    const CACHE_DURATION = 1000 * 60 * 60;
    const cached = localStorage.getItem(CACHE_KEY);
    
    if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION) {
            repoStats.value = data;
            return;
        }
    }

    const repos = [
        { name: "SpotiDownloader", owner: "afkarxyz" },
        { name: "SpotiFLAC-Next", owner: "spotiverse" },
        { name: "Twitter-X-Media-Batch-Downloader", owner: "afkarxyz" },
    ];

    const stats: Record<string, any> = {};
    for (const repo of repos) {
        try {
            const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}`);
            if (res.ok) {
                const data = await res.json();
                stats[repo.name] = {
                    stars: data.stargazers_count,
                    forks: data.forks_count,
                    description: data.description,
                    createdAt: data.created_at
                };
            }
        } catch (err) {
            // console.error(err);
        }
    }
    repoStats.value = stats;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: stats, timestamp: Date.now() }));
};

onMounted(() => {
    fetchRepoStats();
});

const copyUsdt = () => {
    navigator.clipboard.writeText("THnzAAwZgp2Sq5CAXLP2njQDhTvgZG9EWs");
    copiedUsdt.value = true;
    toast.success("Wallet address copied");
    setTimeout(() => copiedUsdt.value = false, 2000);
};

const openExternal = (url: string) => {
    window.open(url, '_blank');
};

const formatTimeAgo = (date: string) => {
    const d = new Date(date);
    return `${new Date().getFullYear() - d.getFullYear()}y`;
};
</script>

<template>
  <div class="h-full flex flex-col space-y-6 max-w-[1200px] mx-auto pb-12">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6 sticky top-0 bg-background/95 backdrop-blur z-20">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">About SpotiFLAC</h1>
        <p class="text-muted-foreground">The most advanced FLAC ecosystem for cross-platform audio preservation.</p>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex p-1 bg-muted rounded-xl w-fit gap-1">
      <button 
        @click="activeTab = 'projects'" 
        :class="['px-6 py-2 rounded-lg text-sm font-bold transition-all', activeTab === 'projects' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground']"
      >
        <Blocks class="h-4 w-4 inline-block mr-2" />
        Ecosystem
      </button>
      <button 
        @click="activeTab = 'support'" 
        :class="['px-6 py-2 rounded-lg text-sm font-bold transition-all', activeTab === 'support' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground']"
      >
        <Heart class="h-4 w-4 inline-block mr-2" />
        Support
      </button>
    </div>

    <!-- Content -->
    <div v-if="activeTab === 'projects'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
       <Card v-for="(repo, name) in repoStats" :key="name" class="group hover:border-primary/50 transition-all hover:translate-y-[-4px] hover:shadow-xl shadow-primary/5">
         <CardHeader>
           <div class="flex justify-between items-start mb-2">
             <div class="p-2 bg-primary/10 rounded-lg text-primary">
               <Github class="h-6 w-6" />
             </div>
             <div class="flex items-center gap-3">
               <span class="flex items-center gap-1 text-xs font-bold text-amber-500">
                 <Star class="h-3.5 w-3.5 fill-current" /> {{ repo.stars }}
               </span>
               <span class="flex items-center gap-1 text-xs font-bold text-muted-foreground">
                 <GitFork class="h-3.5 w-3.5" /> {{ repo.forks }}
               </span>
             </div>
           </div>
           <CardTitle class="text-xl group-hover:text-primary transition-colors">{{ name }}</CardTitle>
           <CardDescription class="line-clamp-2 min-h-[40px]">{{ repo.description }}</CardDescription>
         </CardHeader>
         <CardContent class="space-y-4">
           <div class="flex items-center justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
             <span class="flex items-center gap-1"><Clock class="h-3 w-3" /> {{ formatTimeAgo(repo.createdAt) }} ago</span>
             <span class="text-primary hover:underline cursor-pointer" @click="openExternal(`https://github.com/afkarxyz/${name}`)">View on GitHub</span>
           </div>
         </CardContent>
       </Card>
    </div>

    <div v-else class="flex flex-col items-center justify-center space-y-8 animate-in fade-in zoom-in duration-500 py-12">
      <div class="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8">
        <!-- Ko-fi -->
        <Card class="relative overflow-hidden group">
          <div class="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <Coffee class="h-32 w-32" />
          </div>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <div class="h-10 w-10 rounded-full bg-[#72a4f2]/10 flex items-center justify-center text-[#72a4f2]">
                <Coffee class="h-6 w-6" />
              </div>
              Ko-fi Support
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-6">
            <p class="text-sm text-muted-foreground">
              Directly support the SpotiFLAC development cycle. Your contributions pay for high-res accounts and server hosting.
            </p>
            <Button @click="openExternal('https://ko-fi.com/afkarxyz')" class="w-full h-12 bg-[#72a4f2] hover:bg-[#5f8cd6] text-white font-bold text-lg rounded-xl shadow-lg shadow-blue-500/20">
              Buy me a coffee
            </Button>
          </CardContent>
        </Card>

        <!-- Crypto -->
        <Card class="relative overflow-hidden group">
          <div class="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <Wallet class="h-32 w-32" />
          </div>
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-emerald-500">
               <div class="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Wallet class="h-6 w-6" />
              </div>
              USDT (TRC20)
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-6 relative">
            <p class="text-sm text-muted-foreground">
              Anonymous crypto donations are welcomed for project sustainability.
            </p>
            <div class="flex items-center gap-2 p-3 bg-muted rounded-xl border border-muted-foreground/10 group/code">
              <code class="text-xs font-mono font-bold truncate flex-1">THnzAAwZgp...ZG9EWs</code>
              <Button variant="ghost" size="icon" @click="copyUsdt" class="h-8 w-8 hover:bg-emerald-500/20 hover:text-emerald-500">
                <CircleCheck v-if="copiedUsdt" class="h-4 w-4" />
                <Copy v-else class="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div class="text-center max-w-lg space-y-2">
         <h4 class="font-bold text-primary">THANK YOU FOR YOUR SUPPORT</h4>
         <p class="text-xs text-muted-foreground leading-relaxed">
           SpotiFLAC is and will always be free. These donations are completely voluntary but deeply appreciated by the collective.
         </p>
      </div>
    </div>
  </div>
</template>

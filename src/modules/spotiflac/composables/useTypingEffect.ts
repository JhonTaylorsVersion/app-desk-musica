import { ref, onMounted, onUnmounted, watch, unref, type Ref } from 'vue';

export function useTypingEffect(stringsRef: string[] | Ref<string[]>, typeSpeed = 100, backSpeed = 50, delay = 2000) {
  const text = ref('');
  const stringIndex = ref(0);
  const charIndex = ref(0);
  const isDeleting = ref(false);
  let timeoutId: any = null;

  const tick = () => {
    const strings = unref(stringsRef);
    if (!strings || strings.length === 0) return;
    
    const currentString = strings[stringIndex.value % strings.length];
    
    if (isDeleting.value) {
      text.value = currentString.substring(0, charIndex.value - 1);
      charIndex.value--;
    } else {
      text.value = currentString.substring(0, charIndex.value + 1);
      charIndex.value++;
    }

    let speed = isDeleting.value ? backSpeed : typeSpeed;

    if (!isDeleting.value && charIndex.value === currentString.length) {
      speed = delay;
      isDeleting.value = true;
    } else if (isDeleting.value && charIndex.value === 0) {
      isDeleting.value = false;
      stringIndex.value = (stringIndex.value + 1) % strings.length;
      speed = 500;
    }

    timeoutId = setTimeout(tick, speed);
  };

  // Reset if the strings change
  watch(() => unref(stringsRef), () => {
    if (timeoutId) clearTimeout(timeoutId);
    stringIndex.value = 0;
    charIndex.value = 0;
    isDeleting.value = false;
    tick();
  }, { deep: true });

  onMounted(() => {
    tick();
  });

  onUnmounted(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });

  return text;
}

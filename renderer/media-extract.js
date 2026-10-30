window.extractVideo = async (url) => {
  const video = document.getElementById('source');
  function waitFor(name) { return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('视频读取超时，请转换为 MP4 / WebM 后重试')), 15000);
    const success = () => done(); const failure = () => done(new Error('无法解码视频，请转换为 MP4 / WebM 后重试'));
    function done(error) { clearTimeout(timer); video.removeEventListener(name, success); video.removeEventListener('error', failure); error ? reject(error) : resolve(); }
    video.addEventListener(name, success, { once: true }); video.addEventListener('error', failure, { once: true });
  }); }
  const loaded = waitFor('loadeddata'); video.src = url; await loaded;
  if (!Number.isFinite(video.duration) || video.duration <= 0) throw Error('无法识别视频长度');
  const canvas = document.createElement('canvas'); const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const frames = []; const count = Math.min(8, Math.max(1, Math.ceil(video.duration / 10)));
  for (let i = 0; i < count; i++) {
    const time = video.duration * (count === 1 ? 0.5 : 0.02 + i / (count - 1) * 0.96);
    if (Math.abs(video.currentTime - time) > 0.005) { const seeked = waitFor('seeked'); video.currentTime = time; await seeked; }
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push({ time, data: canvas.toDataURL('image/jpeg', 0.78).split(',')[1] });
  }
  const duration = video.duration; video.removeAttribute('src'); video.load(); return { duration, frames };
};
